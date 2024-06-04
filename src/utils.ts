import { PrismaClient } from "@prisma/client";

export const monthToNumber = (month: string): number => {
	const months = [
		'january',
		'february',
		'march',
		'april',
		'may',
		'june',
		'july',
		'august',
		'september',
		'october',
		'november',
		'december',
	];

	if (!month) {
		return 0;
	}

	return months.indexOf(month.toLowerCase()) + 1;
};

export interface Piscine {
	year: string;
	year_num: number;
	month: string;
	month_num: number;
};

export const getAllPiscines = async function(prisma: PrismaClient): Promise<Piscine[]> {
	// Find all possible piscines
	const piscines_users = await prisma.user.findMany({
		select: {
			pool_year: true,
			pool_year_num: true,
			pool_month: true,
			pool_month_num: true,
		},
		distinct: ['pool_year', 'pool_month'],
		orderBy: [
			{ pool_year_num: 'desc' },
			{ pool_month_num: 'desc' },
		],
	});
	const piscines: Piscine[] = piscines_users.flatMap((p) => {
		// Do not include empty pool_month or pool_year
		if (!p.pool_year || !p.pool_month || !p.pool_year_num || !p.pool_month_num || p.pool_year_num < 1 || p.pool_month_num < 1) {
			return [];
		}
		return {
			year: p.pool_year,
			year_num: p.pool_year_num,
			month: p.pool_month,
			month_num: p.pool_month_num,
		};
	});
	return piscines;
}
