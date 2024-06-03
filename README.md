# CodamHero v2
CodamHero v2 gives staff and students an overview of everything Codam.

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
