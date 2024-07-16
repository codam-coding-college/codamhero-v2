import NodeCache from 'node-cache';

export const piscineCache = new NodeCache();

export const invalidateAllCache = function() {
	piscineCache.flushAll();
};
