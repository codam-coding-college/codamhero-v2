import { PrismaClient, Location, CursusUser, ProjectUser } from "@prisma/client";
import { PISCINE_CURSUS_IDS } from "./intra/cursus";
const PISCINE_MIN_USER_COUNT = 60;

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

export const getLatestPiscine = async function(prisma: PrismaClient): Promise<Piscine | null> {
	const piscines = await getAllPiscines(prisma);
	return piscines[0] || null;
};

export const getAllPiscines = async function(prisma: PrismaClient): Promise<Piscine[]> {
	// Find all possible piscines with over PISCINE_MIN_USER_COUNT users
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
		if (p._count.id < PISCINE_MIN_USER_COUNT) {
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
};

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
};


export const formatDate = function(date: Date): string {
	// YYYY-MM-DD HH:MM:SS
	if (!date) {
		return '';
	}
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, '0');
	const day = date.getDate().toString().padStart(2, '0');
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const projectStatusToString = function(projectUser: ProjectUser, useNbsp: boolean = true): string {
	if (projectUser.marked_at) {
		return (projectUser.final_mark! > 0 ? projectUser.final_mark!.toString() : '0');
	}
	switch (projectUser.status) {
		case 'in_progress':
		case 'waiting_for_correction':
		case 'searching_a_group':
		case 'creating_group':
		case 'waiting_to_start':
			return '...';
		case 'not_started':
			return (useNbsp ? ' ' : ''); // &nbsp;
		case 'finished':
			return '...'; // can happen at the end of a piscine when a group is automatically closed
		default:
			return projectUser.status;
	}
};
