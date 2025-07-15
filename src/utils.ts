import { PrismaClient, Location, CursusUser, ProjectUser, User, Cursus, Project } from "@prisma/client";
import { INTRA_PISCINE_ASSISTANT_GROUP_ID } from './env';
import { DISCO_PISCINE_CURSUS_IDS, PISCINE_CURSUS_IDS } from "./intra/cursus";
import { IntraUser } from "./intra/oauth";
import NodeCache from "node-cache";

const cursusCache = new NodeCache();
const PISCINE_MIN_USER_COUNT = 40;
const DISCO_PISCINE_MIN_USER_COUNT = 5;
const prisma = new PrismaClient();

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

export const monthToNumber = (month: string): number => {
	if (!month) {
		return 0;
	}

	return months.indexOf(month.toLowerCase()) + 1;
};

export const numberToMonth = (month: number): string => {
	if (month < 1 || month > 12) {
		return '';
	}

	return months[month - 1];
};

// Returns the ISO week of the date.
// Modified from: https://weeknumber.com/how-to/javascript
export const getISOWeekNumber = function(date: Date): number {
	const newDate = new Date(date.getTime());
	newDate.setHours(0, 0, 0, 0);
	// Thursday in current week decides the year.
	newDate.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
	// January 4 is always in week 1.
	var week1 = new Date(newDate.getFullYear(), 0, 4);
	// Adjust to Thursday in week 1 and count number of weeks from date to week1.
	return 1 + Math.round(((newDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

export interface CPiscine {
	year: string;
	year_num: number;
	month: string;
	month_num: number;
	user_count: number;
};

export interface DiscoPiscine {
	cursus: Cursus; // Cursus object for the discovery piscine
	year: string;
	year_num: number;
	week: string;
	week_num: number;
	end_ats: Date[];
	user_count: number;
};

export interface Cohort {
	year: string;
	year_num: number;
	user_count: number;
	user_count_active: number;
};

export const getLatestCPiscine = async function(prisma: PrismaClient): Promise<CPiscine | null> {
	const piscines = await getAllCPiscines(prisma);
	return piscines[0] || null;
};

export const getAllCPiscines = async function(prisma: PrismaClient, limitToCurrentYear: boolean = false): Promise<CPiscine[]> {
	// If the data is already in the cache, return it
	const cachedData = cursusCache.get('allPiscines');
	if (cachedData) {
		if (limitToCurrentYear) {
			const currentYear = new Date().getFullYear();
			return (cachedData as CPiscine[]).filter((p) => p.year_num === currentYear);
		}
		return cachedData as CPiscine[];
	}

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
		where: {
			kind: {
				not: 'admin',
			},
			cursus_users: {
				some: {
					OR: [
						{
							cursus_id: 4 // deprecated Piscine C
						},
						{
							cursus_id: 9 // new C Piscine
						},
					],
				},
			},
		},
	});

	// Create piscines array from the grouped data
	const piscines: CPiscine[] = piscines_users.flatMap((p) => {
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

	// Cache the result for 5 minutes
	cursusCache.set('allPiscines', piscines, 300);
	if (limitToCurrentYear) {
		const currentYear = new Date().getFullYear();
		return (piscines as CPiscine[]).filter((p) => p.year_num === currentYear);
	}
	return piscines;
};

export const shortenDiscoPiscineCursusName = function(cursusName: string): string {
	return cursusName.split(' - ')[1];
}

export const getLatestDiscoPiscine = async function(prisma: PrismaClient): Promise<DiscoPiscine | null> {
	const discoPiscines = await getAllDiscoPiscines(prisma);
	return discoPiscines[0] || null;
};

export const getAllDiscoPiscines = async function(prisma: PrismaClient, limitToCurrentYear: boolean = false): Promise<DiscoPiscine[]> {
	// If the data is already in the cache, return it
	const cachedData = cursusCache.get('allDiscoPiscines');
	if (cachedData) {
		if (limitToCurrentYear) {
			const currentYear = new Date().getFullYear();
			return (cachedData as DiscoPiscine[]).filter((p) => p.year_num === currentYear);
		}
		return cachedData as DiscoPiscine[];
	}

	// Find all possible discovery piscines with over DISCO_PISCINE_MIN_USER_COUNT users
	// Assume all discovery piscines end at the exact same time.
	// We look at end_at instead of begin_at as some latecomers might have a different begin_at.
	const disco_piscines_cursus_users = await prisma.cursusUser.groupBy({
		by: ['cursus_id', 'end_at'],
		_count: {
			id: true,
		},
		orderBy: [
			{ end_at: 'desc' },
		],
		where: {
			cursus_id: {
				in: DISCO_PISCINE_CURSUS_IDS, // All discovery piscine cursus ids
			},
			end_at: {
				not: null, // Only include cursus_users that have an end date set
			},
		},
	});

	// Create disco piscines array from the grouped data
	const discoPiscines: DiscoPiscine[] = [];
	for (const p of disco_piscines_cursus_users) {
		// Do not include empty end_at
		if (!p.end_at) {
			return [];
		}
		// Assume all discovery piscines last 1 week, so we can calculate the week number
		const endDate = new Date(p.end_at);
		const beginDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // 1 week before end_at
		const year = beginDate.getFullYear();
		const weekNumber = getISOWeekNumber(beginDate);
		// If a disco piscine for this cursus_id, year and week already exists, just add the user count and end_at
		const existingPiscine = discoPiscines.find((dp) => dp.cursus.id == p.cursus_id && dp.year_num === year && dp.week_num === weekNumber);
		if (existingPiscine) {
			existingPiscine.user_count += p._count.id;
			existingPiscine.end_ats.push(endDate);
			continue;
		}

		// Fetch cursus object for the discovery piscine
		const cursus = await prisma.cursus.findUnique({
			where: {
				id: p.cursus_id,
			},
		});
		if (!cursus) {
			console.error(`Cursus ${p.cursus_id} not found in database for Discovery Piscine ${year}, week ${weekNumber}`);
			continue;
		}

		discoPiscines.push({
			cursus: cursus,
			year: year.toString(),
			year_num: year,
			week: weekNumber.toString().padStart(2, '0'), // Ensure week is two digits
			week_num: weekNumber,
			end_ats: [endDate],
			user_count: p._count.id,
		});
	}

	// Remove disco piscines with less than DISCO_PISCINE_MIN_USER_COUNT users
	const filteredDiscoPiscines = discoPiscines.filter((dp) => dp.user_count >= DISCO_PISCINE_MIN_USER_COUNT);

	// Cache the result for 5 minutes
	cursusCache.set('allDiscoPiscines', filteredDiscoPiscines, 300);
	if (limitToCurrentYear) {
		const currentYear = new Date().getFullYear();
		return (filteredDiscoPiscines as DiscoPiscine[]).filter((p) => p.year_num === currentYear);
	}
	return filteredDiscoPiscines;
};

export const getLatestCohort = async function(prisma: PrismaClient): Promise<Cohort | null> {
	const cohorts = await getAllCohorts(prisma);
	return cohorts[0] || null;
};

export const getAllCohorts = async function(prisma: PrismaClient): Promise<Cohort[]> {
	// If the data is already in the cache, return it
	const cachedData = cursusCache.get('allCohorts');
	if (cachedData) {
		return cachedData as Cohort[];
	}
	// Find all possible 42cursus and deprecated 42 cursus begin_ats
	const cursusUsers = await prisma.cursusUser.findMany({
		where: {
			cursus_id: 21,
		},
		select: {
			begin_at: true,
			end_at: true,
		},
	});
	const cohorts: Cohort[] = [];
	for (const cursusUser of cursusUsers) {
		const year_num = cursusUser.begin_at.getFullYear();
		const existingCohort = cohorts.find((c) => c.year_num === year_num);
		const activeCursus = cursusUser.end_at === null || cursusUser.end_at > new Date();
		if (existingCohort) {
			existingCohort.user_count++;
			if (activeCursus) {
				existingCohort.user_count_active++;
			}
		}
		else {
			cohorts.push({
				year_num,
				year: year_num.toString(),
				user_count: 1,
				user_count_active: activeCursus ? 1 : 0,
			});
		}
	}

	// Sort the cohorts by year in descending order
	cohorts.sort((a, b) => b.year_num - a.year_num);

	// Cache the result for 5 minutes
	cursusCache.set('allCohorts', cohorts, 300);
	return cohorts;
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

export const getPiscineProjects = async function(prisma: PrismaClient, piscineProjectIdsOrdered: number[]): Promise<Project[]> {
	// Fetch all projects for the piscine
	const projects = await prisma.project.findMany({
		where: {
			id: {
				in: piscineProjectIdsOrdered,
			},
		},
	});

	// Order projects based on the order of project ids defined in piscineProjectIdsOrdered
	projects.sort((a, b) => {
		return piscineProjectIdsOrdered.indexOf(a.id) - piscineProjectIdsOrdered.indexOf(b.id);
	});

	return projects;
};

export const isCPiscineDropout = function(cursusUser: CursusUser): boolean {
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

export const isDiscoPiscineDropout = function(cursusUser: CursusUser): boolean {
	return false; // TODO: implement dropout detection for discovery piscines
};

export const isStudentOrStaff = async function(intraUser: IntraUser | User): Promise<boolean> {
	// If the user account is of kind "admin", let them continue
	if (intraUser.kind === 'admin') {
		return true;
	}
	// If the student has an ongoing 42cursus, let them continue
	const userId = intraUser.id;
	const cursusUser = await prisma.cursusUser.findFirst({
		where: {
			user_id: userId,
			cursus_id: 21,
			end_at: null,
		},
	});
	return (cursusUser !== null);
};

export const isCatOrStaff = async function(intraUser: IntraUser | User): Promise<boolean> {
	// If the user account is of kind "admin", let them continue
	if (intraUser.kind === 'admin') {
		return true;
	}
	// If the student is in the C.A.T. (piscine assistants) group, let them continue
	const userId = intraUser.id;
	const catGroupUser = await prisma.groupUser.findMany({
		where: {
			user_id: userId,
			group_id: INTRA_PISCINE_ASSISTANT_GROUP_ID,
		},
	});
	return (catGroupUser.length > 0);
};

export const hasLimitedPiscineHistoryAccess = function(intraUser: IntraUser | User): boolean {
	if ((intraUser as IntraUser)?.kind === 'admin') {
		return false;
	}
	return true;
};

export const hasPiscineHistoryAccess = function(intraUser: IntraUser | User, year: number): boolean {
	if ((intraUser as IntraUser)?.kind === 'admin') {
		return true;
	}
	const now = new Date();
	if (year != now.getFullYear()) {
		return false;
	}
	return true;
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
