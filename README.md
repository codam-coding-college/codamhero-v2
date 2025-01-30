# CodamHero v2
CodamHero v2 gives staff and students an overview of everything Codam.

## Limited access
Only staff members or C.A.T.s have access to (parts of) piscine overviews by design.

## Development
To get started, run the folllowing:
```bash
npm install
npm run build
cp .env.example .env
nano .env
npx prisma migrate deploy
npm run start
```

To migrate the database, run:
```bash
npx prisma migrate dev --name "<migration-name>"
```
