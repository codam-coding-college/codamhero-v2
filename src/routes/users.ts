import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { getAllPiscines } from '../utils';

export const setupUsersRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/users', passport.authenticate('session'), (req, res) => {
		return res.redirect('/users/students');
	});

	app.get('/users/students', passport.authenticate('session'), async (req, res) => {
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

	app.get('/users/staff', passport.authenticate('session'), async (req, res) => {
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

	app.get('/users/pisciners', passport.authenticate('session'), async (req, res) => {
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
	app.get('/users/pisciners/:year/:month', passport.authenticate('session'), async (req, res) => {
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
};
