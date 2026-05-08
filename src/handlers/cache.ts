import NodeCache from 'node-cache';

export const piscineCache = new NodeCache();
export const coreCache = new NodeCache();

export const invalidateAllCache = function() {
	piscineCache.flushAll();
	coreCache.flushAll();
};
