import { Express } from 'express';
import passport from 'passport';

export const setupHomeRoutes = function(app: Express): void {
	app.get('/', passport.authenticate('session', {
		keepSessionInfo: true,
	}), (req, res) => {
		return res.render('index.njk');
	});
};
