# Claude Code Instructions

## Commit Messages

- Do NOT add the following footer to commit messages:
  - `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
  - `Co-Authored-By: Claude ...`
- Keep commit messages clean and concise

## Code Style

- Write all comments and documentation in English

## iotown-mqtt-bridge

Node.js service that bridges MQTT messages from ChirpStack to IOTOWN.

### Structure

```
iotown-mqtt-bridge/
├── src/
│   ├── index.js           # Entry point, config validation, starts bridge
│   ├── config.js          # Loads YAML config from /etc/iotown-mqtt-bridge/config.yml
│   ├── bridge.js          # Main bridge class, forwards ChirpStack -> IOTOWN
│   ├── chirpstack-client.js  # ChirpStack MQTT client
│   ├── iotown-client.js      # IOTOWN MQTT client (TLS)
│   ├── mapping.js         # Topic transformation logic
│   └── logger.js          # Logging utility
├── package.json
└── Dockerfile
```

### Configuration

- Location: `configuration/iotown-mqtt-bridge/config.yml`
- Mounted as `/etc/iotown-mqtt-bridge/config.yml` in Docker
- Run `docker compose restart iotown-mqtt-bridge` after config changes

### Topic Transformation

```
ChirpStack: application/{application_id}/device/{dev_eui}/event/up
     ↓
IOTOWN:     iotown/{group_id}/{device_id}/data
```

- `application_id` → `group_id`: Mapped via `appGroupMapping`, falls back to `defaultGroupId`
- `dev_eui` → `device_id`: Same value

### Host Machine Access

Use `host.docker.internal` to access host's localhost from container.
`extra_hosts` is configured in `docker-compose.yml`.
