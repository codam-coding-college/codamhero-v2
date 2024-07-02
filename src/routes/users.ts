import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { getAllPiscines, getLatestPiscine } from '../utils';

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
				cursus_users: {
					some: {
						cursus_id: 21,
						end_at: null,
					},
				},
			},
			include: {
				cursus_users: {
					where: {
						cursus_id: 21,
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
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
				cursus_users: {
					some: {
						OR: [
							{
								cursus_id: 21, // new 42cursus
								end_at: null,
							},
							{
								cursus_id: 1, // deprecated 42
								end_at: null,
							},
						],
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
			],
		});

		return res.render('users.njk', { users });
	});

	app.get('/users/pisciners', passport.authenticate('session'), async (req, res) => {
		// Redirect to latest year and month defined in the database
		const latest = await getLatestPiscine(prisma);
		if (latest) {
			return res.redirect(`/users/pisciners/${latest.year_num}/${latest.month_num}`);
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
				cursus_users: {
					some: {
						OR: [
							{ cursus_id: 9 }, // new C Piscine
							{ cursus_id: 4 }, // deprecated Piscine C
						],
					},
				},
			},
			include: {
				cursus_users: {
					where: {
						OR: [
							{ cursus_id: 9 }, // new C Piscine
							{ cursus_id: 4 }, // deprecated Piscine C
						],
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
			],
		});

		return res.render('users.njk', { piscines, users, year, month });
	});
};
