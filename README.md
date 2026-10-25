# Altheo Homes

Apartment bookings, rent and fee payments, repairs and cleaning for Altheo Homes' apartment complexes.

- `backend/`: FastAPI (Python 3.14) + MySQL 8.4
- `frontend/`: React + TypeScript (Vite)
- `legacy/`: the first Next.js version, kept as a reference while features are ported

## Quick start
Needs Docker (Docker Desktop or any docker compose).

```bash
make up
```
Then open http://localhost:5173. The API is at http://localhost:8000 (docs at http://localhost:8000/docs).

```bash
make test   # run all tests
make down   # stop
make        # list all commands
```

See [CLAUDE.md](CLAUDE.md) for how the project is organised and the rules for contributing.
