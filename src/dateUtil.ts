import { DateTime } from "luxon";

const LOCALE_OPTS = {
	locale: "ro-RO",
	zone: "Europe/Bucharest",
};
export const getISOInFuture = (isoText: string) => {
	let date = DateTime.fromISO(isoText, LOCALE_OPTS);
	if (date <= DateTime.now()) date = date.plus({ days: 1 });
	return date;
};
