import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { Cohort, getAllCohorts, isSingularReqParamInt } from '../utils';
import { checkIfStudentOrStaff } from '../handlers/middleware';
import { getCommonCoreCohortData } from '../handlers/core';

export const setupCommonCoreRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/core', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		const cohorts: Cohort[] = await getAllCohorts(prisma);

		// Redirect to the most recent year defined in the database
		const latest = cohorts[0];
		if (latest) {
			return res.redirect(`/core/${latest.year}`);
		}
		else {
			return res.status(404).send('No cohorts found');
		}
	});

	app.get('/core/:year', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		if (!isSingularReqParamInt(req.params.year, /^(\d{4}|all)$/)) { // Allow "all" as a valid year parameter
			return null;
		}
		const year = (req.params.year === 'all') ? null : parseInt(req.params.year);
		const cohorts: Cohort[] = await getAllCohorts(prisma);

		const { data: { users, stats, logtimes, dropouts, alumni, projects }, isCached } = await getCommonCoreCohortData(prisma, year);

		res.setHeader('X-Cache', (isCached ? 'HIT' : 'MISS'));
		return res.render('core.njk', { subtitle: `${year} cohort`, cohorts, users, year, stats, logtimes, dropouts, alumni, projects });
	});
};
