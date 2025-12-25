#!/bin/bash
set -e

# 사용법 출력
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -a, --arch ARCH    Target architecture: amd64 or arm64 (default: current system)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                 # Build for current architecture"
    echo "  $0 -a amd64        # Build for amd64 (x86_64)"
    echo "  $0 -a arm64        # Build for arm64 (Apple Silicon, AWS Graviton)"
    exit 1
}

# 기본값: 현재 시스템 아키텍처
CURRENT_ARCH=$(uname -m)
case "$CURRENT_ARCH" in
    x86_64)  TARGET_ARCH="amd64" ;;
    aarch64) TARGET_ARCH="arm64" ;;
    arm64)   TARGET_ARCH="arm64" ;;
    *)       TARGET_ARCH="amd64" ;;
esac

# 파라미터 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--arch)
            TARGET_ARCH="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# 아키텍처 검증
if [[ "$TARGET_ARCH" != "amd64" && "$TARGET_ARCH" != "arm64" ]]; then
    echo "Error: Invalid architecture '$TARGET_ARCH'. Use 'amd64' or 'arm64'."
    exit 1
fi

PLATFORM="linux/${TARGET_ARCH}"

# 패키지 이름 및 버전
PACKAGE_NAME="chirpstack-package"
VERSION=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="./dist"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

echo "=== ChirpStack Offline Package Builder ==="
echo "Version: ${VERSION}"
echo "Target:  ${PLATFORM}"
echo ""

# 출력 디렉토리 생성
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/images"

# 1. iotown-mqtt-bridge 이미지 빌드
echo "[1/5] Building iotown-mqtt-bridge image for ${PLATFORM}..."
docker build --platform "${PLATFORM}" -t iotown-mqtt-bridge:latest ./iotown-mqtt-bridge

# 2. 모든 이미지 pull
echo "[2/5] Pulling all images for ${PLATFORM}..."
IMAGES=(
    "chirpstack/chirpstack:4"
    "chirpstack/chirpstack-gateway-bridge:4"
    "chirpstack/chirpstack-rest-api:4"
    "postgres:14-alpine"
    "redis:7-alpine"
    "eclipse-mosquitto:2"
)

for IMAGE in "${IMAGES[@]}"; do
    echo "  Pulling ${IMAGE}..."
    docker pull --platform "${PLATFORM}" "$IMAGE"
done

# 3. 이미지 저장
echo "[3/5] Saving Docker images..."
# 빌드한 이미지 추가
IMAGES+=("iotown-mqtt-bridge:latest")

for IMAGE in "${IMAGES[@]}"; do
    FILENAME=$(echo "$IMAGE" | tr '/:' '_').tar
    echo "  Saving ${IMAGE}..."
    docker save -o "${PACKAGE_DIR}/images/${FILENAME}" "$IMAGE"
done

# 4. 설정 파일 복사
echo "[4/5] Copying configuration files..."
cp docker-compose.yml "${PACKAGE_DIR}/"
cp -r configuration "${PACKAGE_DIR}/"

# 아키텍처 정보 저장
echo "${TARGET_ARCH}" > "${PACKAGE_DIR}/.arch"

# 5. 설치 스크립트 생성
echo "[5/5] Creating install script..."
cat > "${PACKAGE_DIR}/install.sh" << 'INSTALL_SCRIPT'
#!/bin/bash
set -e

echo "=== ChirpStack Offline Installer ==="

# 아키텍처 확인
if [ -f .arch ]; then
    PACKAGE_ARCH=$(cat .arch)
    CURRENT_ARCH=$(uname -m)
    case "$CURRENT_ARCH" in
        x86_64)  CURRENT_ARCH="amd64" ;;
        aarch64) CURRENT_ARCH="arm64" ;;
        arm64)   CURRENT_ARCH="arm64" ;;
    esac

    if [ "$PACKAGE_ARCH" != "$CURRENT_ARCH" ]; then
        echo "WARNING: Package architecture ($PACKAGE_ARCH) differs from system ($CURRENT_ARCH)"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    echo "Architecture: ${PACKAGE_ARCH}"
fi
echo ""

# 1. Docker 이미지 로드
echo "[1/3] Loading Docker images..."
for IMAGE_FILE in ./images/*.tar; do
    echo "  Loading ${IMAGE_FILE}..."
    docker load -i "${IMAGE_FILE}"
done

# 2. 설정 파일 확인
echo "[2/3] Configuration files are in ./configuration/"
echo "  !! Please edit configuration files before starting !!"

# 3. 데이터 디렉토리 생성
echo "[3/3] Creating data directories..."
mkdir -p ./data/postgresql
mkdir -p ./data/redis

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit configuration files in ./configuration/"
echo "  2. Run: docker compose up -d"
echo "  3. Access ChirpStack at http://localhost:8080"
echo ""
INSTALL_SCRIPT

chmod +x "${PACKAGE_DIR}/install.sh"

# docker-compose.yml에서 build 대신 image 사용하도록 수정
sed -i.bak 's|build:|# build:|g; s|context: ./iotown-mqtt-bridge|# context: ./iotown-mqtt-bridge|g; s|dockerfile: Dockerfile|image: iotown-mqtt-bridge:latest|g' "${PACKAGE_DIR}/docker-compose.yml"
rm -f "${PACKAGE_DIR}/docker-compose.yml.bak"

# 압축
echo ""
echo "Creating archive..."
cd "${OUTPUT_DIR}"
tar -czvf "${PACKAGE_NAME}-${TARGET_ARCH}-${VERSION}.tar.gz" "${PACKAGE_NAME}"
rm -rf "${PACKAGE_NAME}"

# Dangling 이미지 정리
echo "Cleaning up dangling images..."
docker image prune -f

echo ""
echo "=== Build Complete ==="
echo "Package: ${OUTPUT_DIR}/${PACKAGE_NAME}-${TARGET_ARCH}-${VERSION}.tar.gz"
echo ""
echo "To deploy:"
echo "  1. Copy the package to target machine (${TARGET_ARCH})"
echo "  2. Extract: tar -xzvf ${PACKAGE_NAME}-${TARGET_ARCH}-${VERSION}.tar.gz"
echo "  3. Run: cd ${PACKAGE_NAME} && ./install.sh"
