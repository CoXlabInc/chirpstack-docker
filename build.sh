#!/bin/bash
set -e

# 사용법 출력
usage() {
    echo "Usage: $0 -a <ARCH> [options]"
    echo ""
    echo "Options:"
    echo "  -a, --arch ARCH    Target architecture: amd64 or arm64 (required)"
    echo "  -b, --bridge-only  Build only iotown-mqtt-bridge"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -a amd64        # Build all for amd64"
    echo "  $0 -a arm64        # Build all for arm64"
    echo "  $0 -a arm64 -b     # Build only bridge for arm64"
    exit 1
}

TARGET_ARCH=""
BRIDGE_ONLY=false

# 파라미터 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--arch)
            TARGET_ARCH="$2"
            shift 2
            ;;
        -b|--bridge-only)
            BRIDGE_ONLY=true
            shift
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

# 아키텍처 필수 확인
if [ -z "$TARGET_ARCH" ]; then
    echo "Error: Architecture is required."
    echo ""
    usage
fi

# 아키텍처 검증
if [[ "$TARGET_ARCH" != "amd64" && "$TARGET_ARCH" != "arm64" ]]; then
    echo "Error: Invalid architecture '$TARGET_ARCH'. Use 'amd64' or 'arm64'."
    exit 1
fi

PLATFORM="linux/${TARGET_ARCH}"

# 패키지 이름 및 버전
PACKAGE_NAME="chirpstack"
VERSION=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="./dist"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

if [ "$BRIDGE_ONLY" = true ]; then
    echo "=== ChirpStack Bridge Builder ==="
else
    echo "=== ChirpStack Offline Package Builder ==="
fi
echo "Version: ${VERSION}"
echo "Target:  ${PLATFORM}"
echo ""

# 출력 디렉토리 생성
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

if [ "$BRIDGE_ONLY" = true ]; then
    # Bridge only 빌드
    echo "[1/4] Building iotown-mqtt-bridge image for ${PLATFORM}..."
    docker build --platform "${PLATFORM}" -t iotown-mqtt-bridge:latest ./iotown-mqtt-bridge

    echo "[2/4] Saving bridge image..."
    docker save iotown-mqtt-bridge:latest | gzip > "${PACKAGE_DIR}/images.tar.gz"

    echo "[3/4] Copying bridge configuration..."
    mkdir -p "${PACKAGE_DIR}/configuration/iotown-mqtt-bridge"
    cp configuration/iotown-mqtt-bridge/config.yml.example "${PACKAGE_DIR}/configuration/iotown-mqtt-bridge/config.yml"

    # 아키텍처 정보 저장
    echo "${TARGET_ARCH}" > "${PACKAGE_DIR}/.arch"

    echo "[4/4] Creating update script..."

else
    # 전체 빌드
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
        "iotown-mqtt-bridge:latest"
    )

    for IMAGE in "${IMAGES[@]}"; do
        if [[ "$IMAGE" != "iotown-mqtt-bridge:latest" ]]; then
            echo "  Pulling ${IMAGE}..."
            docker pull --platform "${PLATFORM}" "$IMAGE"
        fi
    done

    # 3. 이미지 저장 (하나의 파일로 합침)
    echo "[3/5] Saving Docker images..."
    docker save "${IMAGES[@]}" | gzip > "${PACKAGE_DIR}/images.tar.gz"

    # 4. 설정 파일 복사
    echo "[4/5] Copying configuration files..."
    cp docker-compose.yml "${PACKAGE_DIR}/"
    cp -r configuration "${PACKAGE_DIR}/"
    # config.yml.example -> config.yml
    mv "${PACKAGE_DIR}/configuration/iotown-mqtt-bridge/config.yml.example" \
       "${PACKAGE_DIR}/configuration/iotown-mqtt-bridge/config.yml"

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
echo "[1/4] Loading Docker images..."
gunzip -c images.tar.gz | docker load

# 2. 설정 파일 권한 설정
echo "[2/4] Setting configuration file permissions..."
find ./configuration -type f -exec chmod 644 {} \;
find ./configuration -type d -exec chmod 755 {} \;

# 3. 설정 파일 확인
echo "[3/4] Configuration files are in ./configuration/"
echo "  !! Please edit configuration files before starting !!"

# 4. 데이터 디렉토리 생성
echo "[4/4] Creating data directories..."
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
    sed -i.bak 's|    build:|    image: iotown-mqtt-bridge:latest|g' "${PACKAGE_DIR}/docker-compose.yml"
    sed -i.bak '/context: \.\/iotown-mqtt-bridge/d' "${PACKAGE_DIR}/docker-compose.yml"
    sed -i.bak '/dockerfile: Dockerfile/d' "${PACKAGE_DIR}/docker-compose.yml"
    rm -f "${PACKAGE_DIR}/docker-compose.yml.bak"
fi

# update.sh 스크립트 생성
cat > "${PACKAGE_DIR}/update.sh" << 'UPDATE_SCRIPT'
#!/bin/bash
set -e

# Colors
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Update config file: keep existing, save new as .new if different
update_config_file() {
    local src="$1"
    local dst="$2"
    local name="$3"

    if [ ! -f "$dst" ]; then
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst"
        echo -e "  ${GREEN}✓${NC} $name created"
        return 0
    fi

    if diff -q "$src" "$dst" > /dev/null 2>&1; then
        return 0
    fi

    # Save new config as .new for manual review
    cp "$src" "${dst}.new"

    echo -e "  ${YELLOW}⚠${NC}  $name has changes"
    echo -e "      New config: ${BLUE}${dst}.new${NC}"
    echo -e "      Compare: diff ${dst} ${dst}.new"

    CONFIG_UPDATED=$((CONFIG_UPDATED + 1))
}

if [ -z "$1" ]; then
    echo "Usage: $0 <target_path>"
    echo ""
    echo "Update an existing ChirpStack installation."
    echo "Mode is auto-detected based on package contents."
    echo ""
    echo "Example:"
    echo "  $0 /srv/chirpstack"
    exit 1
fi

TARGET_DIR="${1%/}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Target directory '$TARGET_DIR' does not exist."
    exit 1
fi

if [ ! -f "$TARGET_DIR/docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found in '$TARGET_DIR'."
    exit 1
fi

# Auto-detect mode
CONFIG_COUNT=$(ls -1d "${SCRIPT_DIR}/configuration/"*/ 2>/dev/null | wc -l)
if [ "$CONFIG_COUNT" -eq 1 ] && [ -d "${SCRIPT_DIR}/configuration/iotown-mqtt-bridge" ]; then
    BRIDGE_ONLY=true
else
    BRIDGE_ONLY=false
fi

echo -e "${BLUE}ChirpStack Update${NC}"
if [ "$BRIDGE_ONLY" = true ]; then
    echo "(Bridge Only)"
fi
echo "=================================="
echo ""
echo -e "Source: ${YELLOW}$SCRIPT_DIR${NC}"
echo -e "Target: ${YELLOW}$TARGET_DIR${NC}"
echo ""

# 아키텍처 확인
if [ -f "${SCRIPT_DIR}/.arch" ]; then
    PACKAGE_ARCH=$(cat "${SCRIPT_DIR}/.arch")
    CURRENT_ARCH=$(uname -m)
    case "$CURRENT_ARCH" in
        x86_64)  CURRENT_ARCH="amd64" ;;
        aarch64|arm64) CURRENT_ARCH="arm64" ;;
    esac

    if [ "$PACKAGE_ARCH" != "$CURRENT_ARCH" ]; then
        log_warn "Package architecture ($PACKAGE_ARCH) differs from system ($CURRENT_ARCH)"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
    fi
    echo -e "Architecture: ${GREEN}$PACKAGE_ARCH${NC}"
    echo ""
fi

read -p "Proceed with update? [y/N] " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Aborted."; exit 0; }
echo ""

# 1. 서비스 중지
if [ "$BRIDGE_ONLY" = true ]; then
    log_info "[1/4] Stopping iotown-mqtt-bridge..."
    cd "$TARGET_DIR"
    docker compose stop iotown-mqtt-bridge 2>/dev/null || true
else
    log_info "[1/4] Stopping services..."
    cd "$TARGET_DIR"
    docker compose down 2>/dev/null || true
fi

# 2. Docker 이미지 로드
log_info "[2/4] Loading Docker images..."
gunzip -c "${SCRIPT_DIR}/images.tar.gz" | docker load

# 3. 설정 파일 업데이트
log_info "[3/4] Updating configuration..."
CONFIG_UPDATED=0
UPDATED_CONFIGS=""

if [ "$BRIDGE_ONLY" = true ]; then
    update_config_file \
        "${SCRIPT_DIR}/configuration/iotown-mqtt-bridge/config.yml" \
        "${TARGET_DIR}/configuration/iotown-mqtt-bridge/config.yml" \
        "configuration/iotown-mqtt-bridge/config.yml"
else
    find "${SCRIPT_DIR}/configuration" -type f \( -name "*.yml" -o -name "*.toml" -o -name "*.conf" \) 2>/dev/null | while read -r src; do
        rel_path="${src#${SCRIPT_DIR}/}"
        dst="${TARGET_DIR}/${rel_path}"
        [ -f "$dst" ] && update_config_file "$src" "$dst" "$rel_path"
    done
fi

if [ "$CONFIG_UPDATED" -eq 0 ]; then
    echo "  No configuration changes."
fi

# 4. 서비스 시작
if [ "$BRIDGE_ONLY" = true ]; then
    log_info "[4/4] Starting iotown-mqtt-bridge..."
    docker compose up -d iotown-mqtt-bridge 2>/dev/null
else
    log_info "[4/4] Starting services..."
    docker compose up -d 2>/dev/null
fi

echo ""
echo "=================================="
echo -e "${GREEN}✓ Update completed!${NC}"
echo "=================================="
echo ""

if [ "$CONFIG_UPDATED" -gt 0 ]; then
    echo -e "${YELLOW}┌────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│${NC}  ⚠️  $CONFIG_UPDATED config file(s) updated                              ${YELLOW}│${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}  Merge your custom settings from backup if needed.        ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  Backups: .backup.YYYYMMDDHHMMSS                           ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  Compare: diff <backup> <file>                             ${YELLOW}│${NC}"
    echo -e "${YELLOW}└────────────────────────────────────────────────────────────┘${NC}"
    echo ""
fi

if [ "$BRIDGE_ONLY" = true ]; then
    echo "View logs: docker compose logs -f iotown-mqtt-bridge"
else
    echo "Check status: docker compose ps"
    echo "View logs: docker compose logs -f"
fi
echo ""
UPDATE_SCRIPT

chmod +x "${PACKAGE_DIR}/update.sh"

# 압축
echo ""
echo "Creating archive..."
cd "${OUTPUT_DIR}"

ARCHIVE_NAME="${PACKAGE_NAME}-${TARGET_ARCH}-${VERSION}.tar.gz"

if [[ "$(uname)" == "Darwin" ]]; then
    xattr -cr "${PACKAGE_NAME}"
    COPYFILE_DISABLE=1 tar -czvf "${ARCHIVE_NAME}" "${PACKAGE_NAME}"
else
    tar -czvf "${ARCHIVE_NAME}" "${PACKAGE_NAME}"
fi
rm -rf "${PACKAGE_NAME}"

# Dangling 이미지 정리
echo "Cleaning up dangling images..."
docker image prune -f

echo ""
echo "=== Build Complete ==="
echo "Package: ${OUTPUT_DIR}/${ARCHIVE_NAME}"
echo ""

if [ "$BRIDGE_ONLY" = true ]; then
    echo "Update bridge:"
    echo "  1. Copy the package to the server"
    echo "  2. Extract: tar -xzvf ${ARCHIVE_NAME}"
    echo "  3. Run: cd ${PACKAGE_NAME} && ./update.sh /path/to/existing/${PACKAGE_NAME}"
else
    echo "Fresh install:"
    echo "  1. Copy the package to target machine (${TARGET_ARCH})"
    echo "  2. Extract: tar -xzvf ${ARCHIVE_NAME}"
    echo "  3. Run: cd ${PACKAGE_NAME} && ./install.sh"
    echo ""
    echo "Update existing installation:"
    echo "  1. Copy the package to the server"
    echo "  2. Extract: tar -xzvf ${ARCHIVE_NAME}"
    echo "  3. Run: cd ${PACKAGE_NAME} && ./update.sh /path/to/existing/${PACKAGE_NAME}"
fi
