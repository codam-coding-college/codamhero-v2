import { Express } from 'express';
import { Readable } from 'stream';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { Fast42 } from '@codam/fast42';

export const setupCDNProxyRoutes = function(app: Express, prisma: PrismaClient, api: Fast42): void {
	app.get('/cdn/users/:userId/picture', passport.authenticate('session'), async (req, res) => {
		// User ID is expected to be a number, but we should validate it
		const userId = parseInt(req.params.userId);
		if (isNaN(userId)) {
			return res.status(400).send('Invalid user ID');
		}

		const user = await prisma.user.findUnique({
			where: {
				id: userId,
			},
		});

		if (!user) {
			return res.status(404).send('User not found');
		}

		if (!user.image_url) {
			// Return /images/default.png
			return res.status(302).redirect('/images/default.png');
		}

		const picture = await api.download(user.image_url);
		if (picture.ok && picture.body) {
			res.setHeader('Content-Type', picture.headers.get('content-type') || 'image/jpeg');
			res.setHeader('Cache-Control', 'public, max-age=604800'); // Cache for 7 days
			res.setHeader('Content-Length', picture.headers.get('content-length') || '0');
			return Readable.fromWeb(picture.body as any).pipe(res);
		} else {
			return res.status(500).send('Failed to download picture');
		}
	});
};
