import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { Cohort, getAllCohorts, getAllDiscoPiscines, getAllCPiscines, getLatestDiscoPiscine, getLatestCPiscine, numberToMonth, shortenDiscoPiscineCursusName } from '../utils';
import { DISCO_PISCINE_CURSUS_IDS, PISCINE_CURSUS_IDS, REGULAR_CURSUS_IDS } from '../intra/cursus';

export const setupUsersRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/users', passport.authenticate('session'), (req, res) => {
		return res.redirect('/users/students');
	});

	app.get('/users/students', passport.authenticate('session'), async (req, res) => {
		const cohorts: Cohort[] = await getAllCohorts(prisma);

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

		return res.render('users.njk', { subtitle: 'Students', cohorts, users });
	});

	app.get('/users/students/:year', passport.authenticate('session'), async (req, res) => {
		const year = parseInt(req.params.year);

		const cohorts: Cohort[] = await getAllCohorts(prisma);

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

		return res.render('users.njk', { subtitle: `Students (${year} cohort)`, cohorts, users, year });
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
						cursus_id: {
							in: REGULAR_CURSUS_IDS,
						},
						end_at: null,
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
			],
		});

		return res.render('users.njk', { subtitle: 'Staff', users });
	});

	app.get('/users/pisciners', passport.authenticate('session'), async (req, res) => {
		// Redirect to latest year and month defined in the database
		const latest = await getLatestCPiscine(prisma);
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
		const piscines = await getAllCPiscines(prisma);

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
						cursus_id: {
							in: PISCINE_CURSUS_IDS,
						},
					},
				},
			},
			include: {
				cursus_users: {
					where: {
						cursus_id: {
							in: PISCINE_CURSUS_IDS,
						},
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
			],
		});

		return res.render('users.njk', { subtitle: `Pisciners (${year} ${numberToMonth(month)})`, piscines, users, year, month });
	});

	app.get('/users/disco', passport.authenticate('session'), async (req, res) => {
		// Redirect to latest year and month defined in the database
		const latest = await getLatestDiscoPiscine(prisma);
		if (latest) {
			return res.redirect(`/users/disco/${latest.year_num}/${latest.week_num}/${latest.cursus.id}`);
		}
		else {
			// No discovery pisciners found, return 404
			res.status(404);
			return;
		}
	});

	app.get('/users/disco/:year/:week', passport.authenticate('session'), async (req, res) => {
		// No cursus_id provided, redirect to the first discovery piscine found in corresponding year and week
		const year = parseInt(req.params.year);
		const week = parseInt(req.params.week);
		const discopiscines = await getAllDiscoPiscines(prisma);
		const discopiscine = discopiscines.find(p => p.year_num === year && p.week_num === week);
		if (!discopiscine) {
			console.log(`No discovery piscine found for year ${year} and week ${week}`);
			res.status(404);
			return;
		}
		return res.redirect(`/users/disco/${year}/${week}/${discopiscine.cursus.id}`);
	});

	// TODO: Make sure the year starts with 20 and the week is between 01 and 53
	app.get('/users/disco/:year/:week/:cursus_id', passport.authenticate('session'), async (req, res) => {
		// Parse parameters
		const year = parseInt(req.params.year);
		const week = parseInt(req.params.week);
		const cursus_id = parseInt(req.params.cursus_id);

		// Find all possible piscines from the database
		const discopiscines = await getAllDiscoPiscines(prisma);

		// Get the discovery piscine based on the year and week
		const discopiscine = discopiscines.find(p => p.year_num === year && p.week_num === week);
		if (!discopiscine) {
			console.log(`No discovery piscine found for year ${year} and week ${week}`);
			res.status(404);
			return;
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
				cursus_users: {
					where: {
						cursus_id: discopiscine.cursus.id,
						end_at: {
							in: discopiscine.end_ats,
						},
					},
				},
			},
			orderBy: [
				{ usual_full_name: 'asc' }
			],
		});

		return res.render('users.njk', { subtitle: `Discovery Pisciners (${year} week ${week}: ${shortenDiscoPiscineCursusName(discopiscine.cursus.name)})`, discopiscines, users, year, week, cursus_id });
	});
};
