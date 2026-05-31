# motorapi

API for looking up Danish license plates via motorregister.skat.dk.

## Build

### Docker (recommended)

```sh
docker build -t motorapi .
docker run -p 3000:3000 -v $(pwd)/data:/app/data motorapi
```

### Locally

```sh
npm ci
npm run build
npm start
```

For development (no compile step):

```sh
npm run dev
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the API listens on |
| `DB_PATH` | `/app/data/motorapi.db` | Path to the SQLite database |
