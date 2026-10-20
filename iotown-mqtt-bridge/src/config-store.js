const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const config = require('./config');

// Edits config.yml through a YAML document so comments and key order survive web UI saves
function updateConfigFile(edit) {
  const doc = YAML.parseDocument(fs.readFileSync(config.path, 'utf8'));
  edit(doc);

  // Write next to the original and rename, so a crash never leaves half a file
  const tmp = path.join(path.dirname(config.path), `.config.yml.${process.pid}.tmp`);
  fs.writeFileSync(tmp, doc.toString(), { mode: 0o600 });
  fs.renameSync(tmp, config.path);

  return config.reload();
}

module.exports = { updateConfigFile };
