import { PrismaClient } from '@prisma/client';
import { DISCO_PISCINE_AI_FUNDA_PROJECTS_ORDER, DISCO_PISCINE_AI_INTER_PROJECTS_ORDER, DISCO_PISCINE_CORE_PYTHON_PROJECTS_ORDER, DISCO_PISCINE_DEPR_PYTHON_PROJECTS_ORDER, DISCO_PISCINE_WEB_PRGM_ESS_PROJECTS_ORDER } from '../intra/projects';
import { getPiscineProjects, getAllDiscoPiscines, getTimeSpentBehindComputer, isDiscoPiscineDropout, formatSeconds } from '../utils';
import { piscineCache } from './cache';
import { SYNC_INTERVAL } from '../intra/base';
import { REGULAR_CURSUS_IDS } from '../intra/cursus';
import { CPiscineStat } from './piscine';
import { Logtimes, UserListData } from './userlist';

export interface DiscoPiscineLogTimes extends Logtimes {
	dayOne: number;
	dayTwo: number;
	dayThree: number;
	dayFour: number;
	dayFive: number;
};

export interface DiscoPiscineStat extends CPiscineStat {
	// No additions
}

export interface DiscoPiscineData extends UserListData {
	logtimes: { [login: string]: DiscoPiscineLogTimes };
};

export const getDiscoPiscineData = async function(prisma: PrismaClient, year: number, week: number, cursus_id: number, noCache: boolean = false): Promise<DiscoPiscineData | null> {
	// Check if the data is already in the cache
	const cacheKey = `disco-${year}-${week}-${cursus_id}`;
	const cachedData = piscineCache.get(cacheKey);
	if (!noCache && cachedData) {
		return cachedData as DiscoPiscineData;
	}

	// Find all possible piscines from the database
	const discopiscines = await getAllDiscoPiscines(prisma);

	// Get the discovery piscine based on the year and week
	const discopiscine = discopiscines.find(p => p.year_num === year && p.week_num === week && p.cursus.id === cursus_id);
	if (!discopiscine) {
		console.log(`No discovery piscine found for year ${year}, week ${week} and cursus_id ${cursus_id}`);
		return null;
	}

	// Get the project ids in order for the given discovery piscine cursus
	const piscineProjectIdsOrdered: number[] = [];
	switch (discopiscine.cursus.id) {
		case 77:
			piscineProjectIdsOrdered.push(...DISCO_PISCINE_AI_INTER_PROJECTS_ORDER);
			break;
		case 79:
			piscineProjectIdsOrdered.push(...DISCO_PISCINE_AI_FUNDA_PROJECTS_ORDER);
			break;
		case 80:
			piscineProjectIdsOrdered.push(...DISCO_PISCINE_CORE_PYTHON_PROJECTS_ORDER);
			break;
		case 69:
			piscineProjectIdsOrdered.push(...DISCO_PISCINE_DEPR_PYTHON_PROJECTS_ORDER);
			break;
		case 3:
			piscineProjectIdsOrdered.push(...DISCO_PISCINE_WEB_PRGM_ESS_PROJECTS_ORDER);
			break;
		default:
			console.warn(`Unknown discovery piscine cursus_id ${discopiscine.cursus.id}, no projects will be included.`);
			break;
	}

	// Initiate statistics array
	const stats: DiscoPiscineStat[] = [];

	// Find all users with a discovery piscine that matches the end_at of the discopiscine in question
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
					cursus_id: discopiscine.cursus.id,
					end_at: {
						in: discopiscine.end_ats,
					},
				},
			},
		},
		include: {
			project_users: {
				where: {
					project_id: {
						in: piscineProjectIdsOrdered,
					},
				},
				include: {
					project: true,
				}
			},
			cursus_users: {
				where: {
					cursus_id: discopiscine.cursus.id,
					end_at: {
						in: discopiscine.end_ats,
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
		label: 'Total participants',
		value: users.length,
		unit: null,
	});

	let dropouts: { [login: string]: boolean } = {};
	for (const user of users) {
		dropouts[user.login] = isDiscoPiscineDropout(user.cursus_users[0]);
	}
	stats.push({
		label: 'Dropouts',
		value: Object.values(dropouts).filter(d => d).length,
		unit: null,
	});

	// Check for each pisciner if they were last seen more than 36 hours ago
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
		potentialDropouts[user.login] = (Date.now() - lastSeen.getTime()) > 36 * 60 * 60 * 1000; // 36 hours in milliseconds
	}
	stats.push({
		label: 'Potential dropouts',
		value: Object.values(potentialDropouts).filter(d => d).length,
		unit: null,
	});
	stats.push({
		label: 'Remaining',
		value: users.length - Object.values(dropouts).filter(d => d).length - Object.values(potentialDropouts).filter(d => d).length,
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

	// Get logtime for each day of the discovery piscine for each user
	let logtimes: { [login: string]: DiscoPiscineLogTimes } = {}
	for (const user of users) {
		const piscineBegin = user.cursus_users[0]?.begin_at;
		const dayTwo = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 1 * 1000);
		const dayThree = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 2 * 1000);
		const dayFour = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 3 * 1000);
		const dayFive = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 4 * 1000);
		const piscineEnd = new Date(piscineBegin.getTime() + 60 * 60 * 24 * 5 * 1000);

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

		// Calculate seconds spent behind the computer on each day
		logtimes[user.login] = {
			dayOne: getTimeSpentBehindComputer(locationsDuringPiscine, piscineBegin, dayTwo),
			dayTwo: getTimeSpentBehindComputer(locationsDuringPiscine, dayTwo, dayThree),
			dayThree: getTimeSpentBehindComputer(locationsDuringPiscine, dayThree, dayFour),
			dayFour: getTimeSpentBehindComputer(locationsDuringPiscine, dayFour, dayFive),
			dayFive: getTimeSpentBehindComputer(locationsDuringPiscine, dayFive, piscineEnd),
			total: locationsDuringPiscine.reduce((acc, l) => acc + ((l.end_at ? l.end_at.getTime() : Date.now()) - l.begin_at.getTime()) / 1000, 0),
		};
	}
	stats.push({
		label: 'Total logtime',
		value: formatSeconds(Object.values(logtimes).reduce((acc, lt) => acc + lt.total, 0)),
		unit: null,
	})

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

	return { users, stats, logtimes, dropouts, potentialDropouts, activeStudents, projects };
};

export const buildDiscoPiscineCache = async function(prisma: PrismaClient) {
	const discoPiscines = await getAllDiscoPiscines(prisma);
	for (const discoPiscine of discoPiscines) {
		console.debug(`Building cache for Discovery Piscine ${discoPiscine.year} week ${discoPiscine.week} with cursus_id ${discoPiscine.cursus.id}...`);
		await getDiscoPiscineData(prisma, discoPiscine.year_num, discoPiscine.week_num, discoPiscine.cursus.id, true);
	}
};
