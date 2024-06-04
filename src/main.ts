import dotenv from 'dotenv';
dotenv.config({ path: '.env', debug: true });

import express from 'express';
import nunjucks from 'nunjucks';

import { PrismaClient, ProjectUser } from "@prisma/client";
const prisma = new PrismaClient();

import Fast42 from '@codam/fast42';
import { syncWithIntra } from './intra/base';
import { getAllPiscines, getTimeSpentBehindComputer } from './utils';
import { C_PISCINE_PROJECTS_ORDER } from './intra/projects';
let firstSyncComplete = false;

const INTRA_API_UID = process.env.INTRA_API_UID!;
const INTRA_API_SECRET = process.env.INTRA_API_SECRET!;

const app = express();

const nunjucksEnv = nunjucks.configure('templates', {
	autoescape: true,
	express: app,
});

// Add formatting filter for seconds to hh:mm format
nunjucksEnv.addFilter('formatSeconds', (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}`;
});

// Add formatting filter to format a date as "... minutes/hours/days ago"
nunjucksEnv.addFilter('timeAgo', (date: Date | null) => {
	if (!date) {
		return 'never';
	}

	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const years = Math.floor(days / 365);

	if (years > 2) {
		return `${years} years ago`;
	}
	else if (days > 2) { // < 3 days we want to see the hours
		return `${days} days ago`;
	}
	else if (hours > 1) {
		return `${hours} hours ago`;
	}
	else if (minutes > 15) { // > 15 because we synchronize every 15 minutes, otherwise we'll show "just now"
		return `${minutes} minutes ago`;
	}
	else {
		return `just now`;
	}
});

// Add formatting to remove the prefix "C Piscine" from project names
nunjucksEnv.addFilter('removePiscinePrefix', (name: string) => {
	return name.replace(/^C Piscine /, '');
});

// Add formatting for status field of a projectuser
nunjucksEnv.addFilter('formatProjectStatus', (projectUser: ProjectUser) => {
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
			return ' '; // &nbsp;
		case 'finished':
			return 'finished'; // should never happen, the mark should be set
		default:
			return projectUser.status;
	}
});

const waitForFirstSync = async function(req: express.Request, res: express.Response, next: express.NextFunction) {
	if (!firstSyncComplete) {
		console.log(`A visitor requested the path ${req.path}, but we haven't finished syncing yet. Showing a waiting page.`);
		res.render('syncing.njk');
		res.status(503);
	}
	else {
		next();
	}
};

app.use(waitForFirstSync);
app.use(express.static('static'));

app.get('/', (req, res) => {
	return res.render('index.njk');
});

app.get('/users', (req, res) => {
	return res.redirect('/users/students');
});

app.get('/users/students', async (req, res) => {
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
		},
		orderBy: [
			{ first_name: 'asc' },
			{ last_name: 'asc' },
		],
	});

	return res.render('users.njk', { users });
});

app.get('/users/staff', async (req, res) => {
	const users = await prisma.user.findMany({
		where: {
			login: {
				not: {
					startsWith: '3b3-',
				},
			},
			kind: "admin",
		},
		orderBy: [
			{ first_name: 'asc' },
			{ last_name: 'asc' },
		],
	});

	return res.render('users.njk', { users });
});

app.get('/users/pisciners', async (req, res) => {
	// Redirect to latest year and month defined in the database
	const latest = await prisma.user.findFirst({
		orderBy: [
			{ pool_year_num: 'desc' },
			{ pool_month_num: 'desc' },
		],
	});
	if (latest) {
		return res.redirect(`/users/pisciners/${latest.pool_year_num}/${latest.pool_month_num}`);
	}
	else {
		// No pisciners found, return 404
		res.status(404);
		return;
	}
});

// TODO: Make sure the year starts with 20 and the month is between 01 and 12
app.get('/users/pisciners/:year/:month', async (req, res) => {
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
			login: {
				not: {
					startsWith: '3b3-',
				},
			},
			kind: {
				not: "admin",
			},
		},
		orderBy: {
			first_name: 'asc',
			last_name: 'asc',
		},
	});

	return res.render('users.njk', { piscines, users, year, month });
});

app.get('/piscines', async (req, res) => {
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

interface PiscineLogTimes {
	weekOne: number;
	weekTwo: number;
	weekThree: number;
	weekFour: number;
	total: number;
};

app.get('/piscines/:year/:month', async (req, res) => {
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
					cursus_id: 9,
				},
			}
		},
		include: {
			project_users: {
				where: {
					project_id: {
						in: C_PISCINE_PROJECTS_ORDER,
					}
				},
				include: {
					project: true,
				}
			},
			cursus_users: {
				where: {
					cursus_id: 9,
				},
			},
			locations: {
				// Only the latest or current one
				take: 1,
				where: {
					primary: true,
				},
				orderBy: {
					begin_at: 'desc',
				},
			},
		},
	});

	// Sort users by level of their cursus
	users.sort((a, b) => {
		const aLevel = a.cursus_users[0]?.level || 0;
		const bLevel = b.cursus_users[0]?.level || 0;
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
			orderBy: {
				begin_at: 'asc',
			},
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

	// Fetch all projects for the piscine
	const projects = await prisma.project.findMany({
		where: {
			id: {
				in: C_PISCINE_PROJECTS_ORDER,
			},
		},
	});

	for (const user of users) {
		// Add the missing projects to the user
		for (const project_id of C_PISCINE_PROJECTS_ORDER) {
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

		// Order each user's projects based on the order of project ids defined in C_PISCINE_PROJECTS_ORDER
		user.project_users.sort((a, b) => {
			return C_PISCINE_PROJECTS_ORDER.indexOf(a.project_id) - C_PISCINE_PROJECTS_ORDER.indexOf(b.project_id);
		});
	}

	return res.render('piscines.njk', { piscines, projects, users, logtimes, year, month });
});

app.listen(3000, async () => {
	console.log('Server is running on http://localhost:3000');

	console.log('Syncing with Intra...');
	try {
		const api = await new Fast42([{
			client_id: INTRA_API_UID,
			client_secret: INTRA_API_SECRET,
		}]).init();

		await syncWithIntra(api);
		firstSyncComplete = true;
	}
	catch (err) {
		console.error('Failed to synchronize with the Intra API:', err);
		process.exit(1);
	}
});
