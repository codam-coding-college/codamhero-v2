import { PrismaClient } from '@prisma/client';
import { C_PISCINE_PROJECTS_ORDER, DEPR_PISCINE_C_PROJECTS_ORDER } from '../intra/projects';
import { getPiscineProjects, getAllCPiscines, getTimeSpentBehindComputer, isCPiscineDropout, formatSeconds } from '../utils';
import { piscineCache } from './cache';
import { SYNC_INTERVAL } from '../intra/base';
import { PISCINE_CURSUS_IDS, REGULAR_CURSUS_IDS } from '../intra/cursus';
import { Logtimes, Stat, UserListData } from './userlist';

export interface CPiscineLogTimes extends Logtimes {
	weekOne: number;
	weekTwo: number;
	weekThree: number;
	weekFour: number;
};

export interface CPiscineStat extends Stat{
	// No additions
};

export interface CPiscineData extends UserListData {
	logtimes: { [login: string]: CPiscineLogTimes };
	activeStudents: { [login: string]: boolean };
	potentialDropouts: { [login: string]: boolean };
};

export const getCPiscineData = async function(prisma: PrismaClient, year: number, month: number, noCache: boolean = false): Promise<CPiscineData> {
	// Check if the data is already in the cache
	const cacheKey = `piscine-${year}-${month}`;
	const cachedData = piscineCache.get(cacheKey);
	if (!noCache && cachedData) {
		return cachedData as CPiscineData;
	}

	// Initiate statistics array
	const stats: CPiscineStat[] = [];

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
					cursus_id: {
						in: PISCINE_CURSUS_IDS, // Piscine C cursus ids
					},
				},
			}
		},
		include: {
			project_users: {
				where: {
					project_id: {
						in: [0].concat(C_PISCINE_PROJECTS_ORDER, DEPR_PISCINE_C_PROJECTS_ORDER),
					},
				},
				include: {
					project: true,
				}
			},
			cursus_users: {
				where: {
					cursus_id: {
						in: PISCINE_CURSUS_IDS, // Piscine C cursus ids
					},
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
	stats.push({
		label: 'Total candidates',
		value: users.length,
		unit: null,
	});

	// Check for each pisciner if they are a dropout
	let dropouts: { [login: string]: boolean } = {};
	for (const user of users) {
		dropouts[user.login] = isCPiscineDropout(user.cursus_users[0]);
	}
	stats.push({
		label: 'Dropouts',
		value: Object.values(dropouts).filter(isDropout => isDropout).length,
		unit: null,
	});

	// Check for each pisciner if they were last seen more than 60 hours ago
	// If so, mark them as a potential dropout
	// Only do this check if the piscine is currently ongoing, though
	let potentialDropouts: { [login: string]: boolean } = {};
	for (const user of users) {
		// If user is already for sure a dropout, skip this check
		if (dropouts[user.login]) {
			potentialDropouts[user.login] = false;
			continue;
		}
		// If user's piscine cursus has already ended, skip this check
		if (!user.cursus_users[0].end_at || user.cursus_users[0].end_at < new Date()) {
			potentialDropouts[user.login] = false;
			continue;
		}
		const lastSeen = (user.locations[0] ? (user.locations[0].end_at ? user.locations[0].end_at : new Date()) : new Date(0)); // Default to epoch if no location found, so they are considered a potential dropout
		potentialDropouts[user.login] = (Date.now() - lastSeen.getTime()) > 60 * 60 * 60 * 1000; // 60 hours in milliseconds
	}
	stats.push({
		label: 'Potential dropouts',
		value: Object.values(potentialDropouts).filter(isPotentialDropout => isPotentialDropout).length,
		unit: null,
	});
	stats.push({
		label: 'Remaining',
		value: users.length - (Object.values(dropouts).filter(isDropout => isDropout).length + Object.values(potentialDropouts).filter(isPotentialDropout => isPotentialDropout).length),
		unit: null,
	});

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

	// For each user, check if they are also a student in the regular cursus
	let activeStudents: { [login: string]: boolean } = {};
	for (const user of users) {
		if (user.alumnized_at) {
			activeStudents[user.login] = false; // Alumni are not active students
			continue;
		}
		const cursusUsers = await prisma.cursusUser.findMany({
			where: {
				user_id: user.id,
				cursus_id: {
					in: REGULAR_CURSUS_IDS,
				},
				begin_at: {
					lte: new Date(),
				},
				OR: [
					{ end_at: null }, // Currently enrolled
					{ end_at: { gt: new Date() } }, // Future end date
				],
			},
		});
		activeStudents[user.login] = cursusUsers.length > 0;
	}

	// Get logtime for each week of the piscine for each user
	let logtimes: { [login: string]: CPiscineLogTimes } = {}
	for (const user of users) {
		const piscineBegin = new Date(user.cursus_users[0]?.begin_at.setHours(0, 0, 0, 0));
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

		// Calculate seconds spent behind the computer in each week
		logtimes[user.login] = {
			weekOne: getTimeSpentBehindComputer(locationsDuringPiscine, piscineBegin, weekTwo),
			weekTwo: getTimeSpentBehindComputer(locationsDuringPiscine, weekTwo, weekThree),
			weekThree: getTimeSpentBehindComputer(locationsDuringPiscine, weekThree, weekFour),
			weekFour: getTimeSpentBehindComputer(locationsDuringPiscine, weekFour, piscineEnd),
			total: locationsDuringPiscine.reduce((acc, l) => acc + ((l.end_at ? l.end_at.getTime() : Date.now()) - l.begin_at.getTime()) / 1000, 0),
		};
	}
	stats.push({
		label: 'Total logtime',
		value: formatSeconds(Object.values(logtimes).reduce((acc, lt) => acc + lt.total, 0)),
		unit: null,
	});

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

	const projects = await getPiscineProjects(prisma, piscineProjectIdsOrdered);
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

		// Remove any projects that are not part of the piscine
		// Sometimes a user did both piscines and has projects from both, so we need to filter them out
		user.project_users = user.project_users.filter((pu) => piscineProjectIdsOrdered.includes(pu.project_id));

		// Order each user's projects based on the order of project ids defined in piscineProjectIdsOrdered
		user.project_users.sort((a, b) => {
			return piscineProjectIdsOrdered.indexOf(a.project_id) - piscineProjectIdsOrdered.indexOf(b.project_id);
		});
	}

	// Calculate the amount of projects validated
	stats.push({
		label: 'Projects validated',
		value: users.reduce((acc, user) => acc + user.project_users.filter(pu => pu.validated).length, 0),
		unit: null,
	});
	stats.push({
		label: 'Avg. projects validated',
		value: (users.reduce((acc, user) => acc + user.project_users.filter(pu => pu.validated).length, 0) / users.length).toFixed(2),
		unit: null,
	});

	// Cache the data for the remaining time of the sync interval
	piscineCache.set(cacheKey, { users, stats, logtimes, dropouts, potentialDropouts, activeStudents, projects }, SYNC_INTERVAL * 60 * 1000);

	return {
		users,
		stats,
		logtimes,
		dropouts,
		potentialDropouts,
		activeStudents,
		projects
	} as CPiscineData;
};

export const buildCPiscineCache = async function(prisma: PrismaClient) {
	const piscines = await getAllCPiscines(prisma);
	for (const piscine of piscines) {
		console.debug(`Building cache for C Piscine ${piscine.month} ${piscine.year}...`);
		await getCPiscineData(prisma, piscine.year_num, piscine.month_num, true);
	}
};
