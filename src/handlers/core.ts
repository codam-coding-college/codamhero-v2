import { PrismaClient } from "@prisma/client/extension";
import { coreCache } from "./cache";
import { Logtimes, Stat, UserListData } from "./userlist";
import { getAllCohorts, getCommonCoreProjects, getTimeSpentBehindComputer, isCoreDropout } from "../utils";
import { User } from "@prisma/client";
import { SYNC_INTERVAL } from "../intra/base";
import { COMMON_CORE_PROJECTS_ORDER } from "../intra/projects";

export interface CommonCoreLogtimes extends Logtimes {
	pastWeek: number;
	pastMonth: number;
	pastQuarter: number;
};

export interface CommonCoreStat extends Stat {
	// No additions
};

export interface CommonCoreData extends UserListData {
	alumni: { [login: string]: boolean };
};

export const getCommonCoreCohortData = async function(prisma: PrismaClient, year: number, noCache: boolean = false): Promise<CommonCoreData> {
	// Check if the data is already in the cache
	const cacheKey = `core-${year}`;
	const cachedData = coreCache.get(cacheKey);
	if (!noCache && cachedData) {
		return cachedData as CommonCoreData;
	}

	// Initiate statistics array
	const stats: CommonCoreStat[] = [];

	// Find all users for the given year
	const users = await prisma.user.findMany({
		where: {
			login: {
				not: {
					startsWith: '3b3-',
				},
			},
			kind: {
				not: "admin",
			},
			cursus_users: {
				some: {
					cursus_id: 21,
					begin_at: {
						gte: new Date(`${year}-01-01`),
						lt: new Date(`${year + 1}-01-01`),
					},
				},
			},
			// Include dropouts and alumni for the year overview
		},
		include: {
			project_users: {
				where: {
					project: {
						id: {
							in: COMMON_CORE_PROJECTS_ORDER,
						},
					},
				},
				include: {
					project: true,
				},
			},
			cursus_users: {
				where: {
					cursus_id: 21,
				},
			},
			locations: {
				// Only the latest or current one
				take: 1,
				where: {
					primary: true,
				},
				orderBy: [
					{ begin_at: 'desc' },
				],
			},
		},
		orderBy: [
			{ usual_full_name: 'asc' }
		],
	});
	stats.push({
		label: 'Total students',
		value: users.length,
		unit: null,
	});

	// Check for each student if they are a dropout
	let dropouts: { [login: string]: boolean } = {};
	for (const user of users) {
		dropouts[user.login] = isCoreDropout(user.cursus_users[0], user);
	}
	stats.push({
		label: 'Dropouts',
		value: Object.values(dropouts).filter(isDropout => isDropout).length,
		unit: null,
	});

	// Check for each student if they are alumni
	let alumni: { [login: string]: boolean } = {};
	for (const user of users) {
		alumni[user.login] = user.alumnized_at !== null;
	}
	stats.push({
		label: 'Alumni',
		value: Object.values(alumni).filter(isAlumnus => isAlumnus).length,
		unit: null,
	});
	stats.push({
		label: 'Remaining',
		value: users.length - (Object.values(dropouts).filter(isDropout => isDropout).length + Object.values(alumni).filter(isAlumnus => isAlumnus).length),
		unit: null,
	});

	// Sort users first by dropout status, then by name
	users.sort((a: User, b: User) => {
		if (dropouts[a.login] && !dropouts[b.login]) {
			return 1;
		}
		if (!dropouts[a.login] && dropouts[b.login]) {
			return -1;
		}
		return a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name);
	});

	// Get total logtime for each user
	let logtimes: { [login: string]: CommonCoreLogtimes } = {};
	for (const user of users) {
		const cursusStart = user.cursus_users[0].begin_at;
		const cursusEndOrNow = user.cursus_users[0].end_at || new Date();
		const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
		const locations = await prisma.location.findMany({
			where: {
				user_id: user.id,
				begin_at: {
					gte: cursusStart,
					lte: cursusEndOrNow,
				},
			},
			orderBy: [
				{ begin_at: 'asc' },
			],
		});
		logtimes[user.login] = {
			total: getTimeSpentBehindComputer(locations, cursusStart, cursusEndOrNow),
			pastWeek: getTimeSpentBehindComputer(locations, oneWeekAgo, cursusEndOrNow),
			pastMonth: getTimeSpentBehindComputer(locations, oneMonthAgo, cursusEndOrNow),
			pastQuarter: getTimeSpentBehindComputer(locations, threeMonthsAgo, cursusEndOrNow),
		};
	}

	const projects = await getCommonCoreProjects(prisma, COMMON_CORE_PROJECTS_ORDER);
	for (const user of users) {
		// Remove any projects that are not part of the common core
		user.project_users = user.project_users.filter((pu: any) => COMMON_CORE_PROJECTS_ORDER.includes(pu.project_id));

		// Order each user's projects based on the order of project ids defined in COMMON_CORE_PROJECTS_ORDER
		user.project_users.sort((a: any, b: any) => {
			return COMMON_CORE_PROJECTS_ORDER.indexOf(a.project_id) - COMMON_CORE_PROJECTS_ORDER.indexOf(b.project_id);
		});
	}

	// Cache the data for the remaining time of the sync interval
	coreCache.set(cacheKey, { users, stats, logtimes, dropouts, alumni, projects }, SYNC_INTERVAL * 60 * 1000);

	return {
		users,
		stats,
		logtimes,
		dropouts,
		alumni,
		projects,
	} as CommonCoreData;
}

export const buildCommonCoreCache = async function(prisma: PrismaClient) {
	const cohorts = await getAllCohorts(prisma);
	for (const cohort of cohorts) {
		console.debug(`Building cache for Cohort ${cohort.year}...`);
		await getCommonCoreCohortData(prisma, cohort.year_num, true);
	}
};
