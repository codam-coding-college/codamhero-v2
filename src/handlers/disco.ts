import { PrismaClient } from '@prisma/client';
import { DISCO_PISCINE_AI_FUNDA_PROJECTS_ORDER, DISCO_PISCINE_AI_INTER_PROJECTS_ORDER, DISCO_PISCINE_CORE_PYTHON_PROJECTS_ORDER, DISCO_PISCINE_DEPR_PYTHON_PROJECTS_ORDER, DISCO_PISCINE_WEB_PRGM_ESS_PROJECTS_ORDER } from '../intra/projects';
import { getPiscineProjects, getAllDiscoPiscines, getTimeSpentBehindComputer, isDiscoPiscineDropout } from '../utils';
import { piscineCache } from './cache';
import { SYNC_INTERVAL } from '../intra/base';
import { REGULAR_CURSUS_IDS } from '../intra/cursus';

export interface DiscoPiscineLogTimes {
	dayOne: number;
	dayTwo: number;
	dayThree: number;
	dayFour: number;
	dayFive: number;
	total: number;
};

// TODO: define the types for the disco piscine data explicitly
export interface DiscoPiscineData {
	users: any[];
	logtimes: { [login: string]: DiscoPiscineLogTimes };
	dropouts: { [login: string]: boolean };
	activeStudents: { [login: string]: boolean };
	projects: any[];
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

	let dropouts: { [login: string]: boolean } = {};
	for (const user of users) {
		dropouts[user.login] = isDiscoPiscineDropout(user.cursus_users[0]);
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

	// For each user, check if they are also a student in the regular cursus
	let activeStudents: { [login: string]: boolean } = {};
	for (const user of users) {
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

	// Cache the data for the remaining time of the sync interval
	piscineCache.set(cacheKey, { users, logtimes, dropouts, activeStudents, projects }, SYNC_INTERVAL * 60 * 1000);

	return { users, logtimes, dropouts, activeStudents, projects };
};

export const buildDiscoPiscineCache = async function(prisma: PrismaClient) {
	const discoPiscines = await getAllDiscoPiscines(prisma);
	for (const discoPiscine of discoPiscines) {
		console.debug(`Building cache for Discovery Piscine ${discoPiscine.year} week ${discoPiscine.week} with cursus_id ${discoPiscine.cursus.id}...`);
		await getDiscoPiscineData(prisma, discoPiscine.year_num, discoPiscine.week_num, discoPiscine.cursus.id, true);
	}
};
