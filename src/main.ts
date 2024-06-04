import dotenv from 'dotenv';
dotenv.config({ path: '.env', debug: true });

import express from 'express';
import nunjucks from 'nunjucks';

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import Fast42 from '@codam/fast42';
import { syncWithIntra } from './intra/base';
let firstSyncComplete = false;

const INTRA_API_UID = process.env.INTRA_API_UID!;
const INTRA_API_SECRET = process.env.INTRA_API_SECRET!;

const app = express();

nunjucks.configure('templates', {
	autoescape: true,
	express: app,
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

// Make sure the year starts with 20 and the month is between 01 and 12
app.get('/users/pisciners/:year/:month', async (req, res) => {
	// Parse parameters
	const year = parseInt(req.params.year);
	const month = parseInt(req.params.month);

	// Find all possible piscines
	const piscines_users = await prisma.user.findMany({
		select: {
			pool_year: true,
			pool_year_num: true,
			pool_month: true,
			pool_month_num: true,
		},
		distinct: ['pool_year', 'pool_month'],
		orderBy: [
			{ pool_year_num: 'desc' },
			{ pool_month_num: 'desc' },
		],
	});
	const piscines = piscines_users.flatMap((p) => {
		// Do not include empty pool_month or pool_year
		if (!p.pool_year || !p.pool_month || !p.pool_year_num || !p.pool_month_num || p.pool_year_num < 1 || p.pool_month_num < 1) {
			return [];
		}
		return {
			year: p.pool_year,
			year_num: p.pool_year_num,
			month: p.pool_month,
			month_num: p.pool_month_num,
		};
	});

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
		orderBy: [
			{ first_name: 'asc' },
			{ last_name: 'asc' },
		],
	});

	return res.render('users.njk', { piscines, users, year, month });
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
