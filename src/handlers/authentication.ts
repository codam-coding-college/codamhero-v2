import session from 'express-session';
import passport from 'passport';
import OAuth2Strategy from 'passport-oauth2';
import { PrismaClient } from '@prisma/client';
import { INTRA_API_UID, INTRA_API_SECRET, URL_ORIGIN, SESSION_SECRET } from '../env';
import { getIntraUser, IntraUser } from '../intra/oauth';
import { isStudentOrStaff, isCatOrStaff } from '../utils';

export const setupPassport = function(prisma: PrismaClient): void {
	passport.use(new OAuth2Strategy({
		authorizationURL: 'https://api.intra.42.fr/oauth/authorize',
		tokenURL: 'https://api.intra.42.fr/oauth/token',
		clientID: INTRA_API_UID,
		clientSecret: INTRA_API_SECRET,
		callbackURL: `${URL_ORIGIN}/login/42/callback`,
	}, async (accessToken: string, refreshToken: string, profile: any, cb: any) => {
		try {
			const user = await getIntraUser(accessToken);;
			return cb(null, user);
		}
		catch (err) {
			return cb(err, false);
		}
	}));

	passport.serializeUser((user: Express.User, cb: any) => {
		process.nextTick(() => {
			const serializedUser = user as IntraUser;
			return cb(null, serializedUser.login);
		});
	});

	passport.deserializeUser((login: string, cb: any) => {
		process.nextTick(async () => {
			const user = await prisma.user.findFirst({
				where: {
					login: login,
				},
			});
			if (!user) {
				return cb(new Error('User not found'));
			}
			const intraUser: IntraUser = {
				id: user.id,
				email: user.email,
				login: user.login,
				first_name: user.first_name,
				last_name: user.last_name,
				usual_first_name: user.usual_first_name,
				usual_full_name: user.usual_full_name,
				display_name: user.display_name,
				kind: user.kind,
				isStudentOrStaff: await isStudentOrStaff(user),
				isCatOrStaff: await isCatOrStaff(user),
				image_url: user.image,
			};
			cb(null, intraUser);
		});
	});
};

export const usePassport = function(app: any): void {
	app.use(passport.initialize());
	app.use(session({
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: false
		},
	}));
	app.use(passport.session());
};
