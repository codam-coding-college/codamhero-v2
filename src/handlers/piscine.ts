import { PrismaClient } from '@prisma/client';
import { C_PISCINE_PROJECTS_ORDER, DEPR_PISCINE_C_PROJECTS_ORDER } from '../intra/projects';
import { getAllPiscines, getTimeSpentBehindComputer, isPiscineDropout } from '../utils';
import { piscineCache } from './cache';
import { SYNC_INTERVAL } from '../intra/base';

export interface PiscineLogTimes {
	weekOne: number;
	weekTwo: number;
	weekThree: number;
	weekFour: number;
	total: number;
};

// TODO: define the types for the piscine data explicitly
export interface PiscineData {
	users: any[];
	logtimes: { [login: string]: PiscineLogTimes };
	dropouts: { [login: string]: boolean };
	projects: any[];
};

export const getPiscineData = async function(year: number, month: number, prisma: PrismaClient): Promise<PiscineData> {
	// Check if the data is already in the cache
	const cacheKey = `piscine-${year}-${month}`;
	const cachedData = piscineCache.get(cacheKey);
	if (cachedData) {
		return cachedData as PiscineData;
	}

	// Find all users for the given year and month
	const users = await prisma.user.findMany({
		where: {
			pool_year_num: year,
			pool_month_num: month,
			kind: {
				not: "admin",
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
			}
		},
		include: {
			project_users: {
				where: {
					project_id: {
						in: [0].concat(C_PISCINE_PROJECTS_ORDER, DEPR_PISCINE_C_PROJECTS_ORDER),
					}
				},
				include: {
					project: true,
				}
			},
			cursus_users: {
				where: {
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
	});

	// Check for each pisciner if they are a dropout
	let dropouts: { [login: string]: boolean } = {}
	for (const user of users) {
		dropouts[user.login] = isPiscineDropout(user.cursus_users[0]);
	}

	// Sort users first by dropout status, then by name
	users.sort((a, b) => {
		if (dropouts[a.login] && !dropouts[b.login]) {
			return 1;
		}
		if (!dropouts[a.login] && dropouts[b.login]) {
			return -1;
		}
		return a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name);
	});

	// Get logtime for each week of the piscine for each user
	let logtimes: { [login: string]: PiscineLogTimes } = {}
	for (const user of users) {
		const piscineBegin = user.cursus_users[0]?.begin_at;
		const weekTwo = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 7 * 1000);
		const weekThree = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 14 * 1000);
		const weekFour = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 21 * 1000);
		const piscineEnd = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 25 * 1000);

		const locationsDuringPiscine = await prisma.location.findMany({
			where: {
				user_id: user.id,
				begin_at: {
					gte: piscineBegin,
					lte: piscineEnd,
				},
			},
			orderBy: [
				{ begin_at: 'asc' },
			],
		});

		// Calculate seconds spent in each week behind the computer
		logtimes[user.login] = {
			weekOne: getTimeSpentBehindComputer(locationsDuringPiscine, piscineBegin, weekTwo),
			weekTwo: getTimeSpentBehindComputer(locationsDuringPiscine, weekTwo, weekThree),
			weekThree: getTimeSpentBehindComputer(locationsDuringPiscine, weekThree, weekFour),
			weekFour: getTimeSpentBehindComputer(locationsDuringPiscine, weekFour, piscineEnd),
			total: locationsDuringPiscine.reduce((acc, l) => acc + ((l.end_at ? l.end_at.getTime() : Date.now()) - l.begin_at.getTime()) / 1000, 0),
		};
	}

	// Detect piscine type based on the cursus id that shows up most often
	// First count the amount of times each cursus id shows up
	const cursusCounts: { [cursusId: number]: number } = {};
	for (const user of users) {
		for (const cursus of user.cursus_users) {
			if (!cursusCounts[cursus.cursus_id]) {
				cursusCounts[cursus.cursus_id] = 0;
			}
			cursusCounts[cursus.cursus_id]++;
		}
	}
	// Now check which cursus id shows up most often
	let piscineType = 'unknown';
	let highestCount = 0;
	for (const [cursusId, count] of Object.entries(cursusCounts)) {
		if (count > highestCount) {
			highestCount = count;
			piscineType = cursusId === '9' ? 'new' : 'deprecated';
		}
	}
	const piscineProjectIdsOrdered = (piscineType === 'new' ? C_PISCINE_PROJECTS_ORDER : DEPR_PISCINE_C_PROJECTS_ORDER);

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

	for (const user of users) {
		// Add the missing projects to the user
		for (const project_id of piscineProjectIdsOrdered) {
			if (!user.project_users.find((pu) => pu.project_id === project_id)) {
				user.project_users.push({
					id: 0,
					project_id: project_id,
					user_id: user.id,
					final_mark: null,
					status: 'not_started',
					validated: false,
					current_team_id: null,
					created_at: new Date(),
					updated_at: new Date(),
					marked_at: null,
					project: projects.find((p) => p.id === project_id)!,
				});
			}
		}

		// Order each user's projects based on the order of project ids defined in piscineProjectIdsOrdered
		user.project_users.sort((a, b) => {
			return piscineProjectIdsOrdered.indexOf(a.project_id) - piscineProjectIdsOrdered.indexOf(b.project_id);
		});
	}

	// Cache the data for the remaining time of the sync interval
	piscineCache.set(cacheKey, { users, logtimes, dropouts, projects }, SYNC_INTERVAL * 60 * 1000);

	return { users, logtimes, dropouts, projects };
};

export const buildPiscineCache = async function(prisma: PrismaClient) {
	const piscines = await getAllPiscines(prisma);
	for (const piscine of piscines) {
		console.debug(`Building cache for piscine ${piscine.year}-${piscine.month}...`);
		await getPiscineData(piscine.year_num, piscine.month_num, prisma);
	}
};
