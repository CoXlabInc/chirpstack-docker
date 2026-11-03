// Report newer Docker Hub tags for the pinned images in docker-compose.yml.
// Usage: node scripts/check-images.mjs <image:tag>...
// Report only: always exits 0, and says so when Docker Hub cannot be reached (offline build machine).

const VERSION_TAG = /^(v?)(\d+(?:\.\d+)*)(.*)$/;

function parseTag(tag) {
  const m = tag.match(VERSION_TAG);
  if (!m) return null;
  // The suffix keeps its letters but not its numbers, so 14.24-alpine and 16.11-alpine compare
  // while -alpine3.22 or -openssl stay apart
  return { tag, prefix: m[1], nums: m[2].split(".").map(Number), suffix: m[3], shape: m[3].replace(/\d+/g, "#") };
}

function compareNums(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

async function listTags(repo) {
  const path = repo.includes("/") ? repo : `library/${repo}`;
  const timeout = () => AbortSignal.timeout(20000);
  const auth = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${path}:pull`,
    { signal: timeout() }
  );
  const { token } = await auth.json();
  const tags = [];
  let url = `https://registry-1.docker.io/v2/${path}/tags/list?n=10000`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: timeout() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tags.push(...((await res.json()).tags ?? []));
    const next = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? new URL(next[1], "https://registry-1.docker.io").href : null;
  }
  return tags;
}

// "up to date" or the newest patch / minor / major tag of the same shape
function describeUpdates(current, tags) {
  const cur = parseTag(current);
  if (!cur) return "tag is not a version, not checked";
  const newest = {};
  for (const tag of tags) {
    const cand = parseTag(tag);
    if (!cand || cand.prefix !== cur.prefix || cand.shape !== cur.shape || cand.nums.length !== cur.nums.length) continue;
    if (compareNums(cand.nums, cur.nums) <= 0) continue;
    const level = cand.nums[0] !== cur.nums[0] ? "major" : cand.nums[1] !== cur.nums[1] ? "minor" : "patch";
    const best = newest[level];
    const order = best ? compareNums(cand.nums, best.nums) : 1;
    // Same version under several suffixes: keep the one matching ours
    if (order > 0 || (order === 0 && cand.suffix === cur.suffix)) newest[level] = cand;
  }
  const found = ["patch", "minor", "major"].filter((level) => newest[level]).map((level) => `${level} ${newest[level].tag}`);
  return found.length ? `newer: ${found.join(", ")}` : "up to date";
}

const refs = process.argv.slice(2);
const results = await Promise.all(
  refs.map(async (ref) => {
    const colon = ref.lastIndexOf(":");
    const [repo, tag] = colon > ref.lastIndexOf("/") ? [ref.slice(0, colon), ref.slice(colon + 1)] : [ref, "latest"];
    try {
      return [ref, describeUpdates(tag, await listTags(repo))];
    } catch (error) {
      return [ref, null, error];
    }
  })
);
if (results.length && results.every(([, line]) => line === null)) {
  const error = results[0][2];
  console.log(`  Docker Hub not reachable (${error?.cause?.code ?? error?.message}), skipped`);
} else {
  const width = Math.max(0, ...refs.map((ref) => ref.length));
  for (const [ref, line, error] of results) {
    console.log(`  ${ref.padEnd(width)}  ${line ?? `check failed (${error.message})`}`);
  }
}
