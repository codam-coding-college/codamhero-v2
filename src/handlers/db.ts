import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PRISMA_DB_URL } from "../env";

const adapter = new PrismaPg({
	connectionString: PRISMA_DB_URL,
});
export const prisma = new PrismaClient({ adapter });
