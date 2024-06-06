import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { getAllPiscines, getTimeSpentBehindComputer, isPiscineDropout } from '../utils';
import { C_PISCINE_PROJECTS_ORDER, DEPR_PISCINE_C_PROJECTS_ORDER } from '../intra/projects';
import { checkIfStudentOrStaff } from '../handlers/middleware';

export interface PiscineLogTimes {
	weekOne: number;
	weekTwo: number;
	weekThree: number;
	weekFour: number;
	total: number;
};

export const setupPiscinesRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/piscines', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Redirect to latest year and month defined in the database
		const latest = await prisma.user.findFirst({
			orderBy: [
				{ pool_year_num: 'desc' },
				{ pool_month_num: 'desc' },
			],
		});
		if (latest) {
			return res.redirect(`/piscines/${latest.pool_year_num}/${latest.pool_month_num}`);
		}
		else {
			// No pisciners found, return 404
			res.status(404);
			return;
		}
	});

	app.get('/piscines/:year/:month', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Parse parameters
		const year = parseInt(req.params.year);
		const month = parseInt(req.params.month);

		// Find all possible piscines from the database
		const piscines = await getAllPiscines(prisma);

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

		// Sort users first by dropout status, then by level
		users.sort((a, b) => {
			const aLevel = a.cursus_users[0]?.level || 0;
			const bLevel = b.cursus_users[0]?.level || 0;
			if (dropouts[a.login] && !dropouts[b.login]) {
				return 1;
			}
			if (!dropouts[a.login] && dropouts[b.login]) {
				return -1;
			}
			return bLevel - aLevel;
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

		return res.render('piscines.njk', { piscines, projects, users, logtimes, dropouts, year, month });
	});
};
