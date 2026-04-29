import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { Cohort, getAllCohorts, isSingularReqParamInt } from '../utils';
import { checkIfStudentOrStaff } from '../handlers/middleware';
import { getCommonCoreCohortData } from '../handlers/core';

export const setupCommonCoreRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/core', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Redirect to latest cohort
		const cohorts = await getAllCohorts(prisma);
		const latest = cohorts.reduce((latest, cohort) => {
			return cohort.year_num > latest.year_num ? cohort : latest;
		}, cohorts[0]);

		if (latest) {
			return res.redirect(`/core/${latest.year_num}`);
		}
		else {
			// No cohorts found, return 404
			return res.status(404).send('No cohorts found');
		}
	});

	app.get('/core/:year', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		if (!isSingularReqParamInt(req.params.year, /^\d{4}$/)) {
			return null;
		}
		const year = parseInt(req.params.year);
		const cohorts: Cohort[] = await getAllCohorts(prisma);

		const { users, stats, logtimes, dropouts, alumni, projects } = await getCommonCoreCohortData(prisma, year);

		return res.render('core.njk', { subtitle: `${year} cohort`, cohorts, users, year, stats, logtimes, dropouts, alumni, projects });
	});
};
