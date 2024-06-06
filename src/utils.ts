import { PrismaClient, Location, CursusUser } from "@prisma/client";
import { PISCINE_CURSUS_IDS } from "./intra/cursus";

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
	user_count: number;
};

export const getAllPiscines = async function(prisma: PrismaClient): Promise<Piscine[]> {
	// Find all possible piscines with over 60 users
	const piscines_users = await prisma.user.groupBy({
		by: ['pool_year', 'pool_month', 'pool_year_num', 'pool_month_num'],
		_count: {
			id: true,
		},
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
		// Do not include piscines smaller than 60 users
		if (p._count.id < 60) {
			return [];
		}
		return {
			year: p.pool_year,
			year_num: p.pool_year_num,
			month: p.pool_month,
			month_num: p.pool_month_num,
			user_count: p._count.id,
		};
	});
	return piscines;
};

/**
 * Calculate the amount of seconds spent behind a computer between two dates
 * @param locations Locations from the database
 * @param lowerBound A date object representing the lower bound
 * @param upperBound A date object representing the upper bound
 * @returns The amount of seconds spent behind a computer as an integer
 */
export const getTimeSpentBehindComputer = function(locations: Location[], lowerBound: Date, upperBound: Date): number {
	return locations.filter((l) => l.begin_at >= lowerBound && l.begin_at <= upperBound).reduce((acc, l) => acc + ((l.end_at ? l.end_at.getTime() : Date.now()) - l.begin_at.getTime()) / 1000, 0);
}

export const isPiscineDropout = function(cursusUser: CursusUser): boolean {
	const now = new Date();
	if (!(PISCINE_CURSUS_IDS.includes(cursusUser.cursus_id))) {
		return false;
	}
	if (cursusUser.end_at == null || cursusUser.end_at > now) {
		return false;
	}
	// Calculate usual piscine end date (25 days after begin_at)
	// Allow 3 days of inaccuracy for late-starters
	// Last 3 days of piscine are not counted this way, but let's pretend that's fine
	const precision = 3 * 24 * 60 * 60 * 1000;
	const usualPiscineEnd = new Date(new Date(cursusUser.begin_at).getTime() + (25 ) * 24 * 60 * 60 * 1000);
	return cursusUser.end_at.getTime() + precision < usualPiscineEnd.getTime();
}
