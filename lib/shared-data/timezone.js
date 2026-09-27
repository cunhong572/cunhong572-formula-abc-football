// Keep the dependency-free Formula A implementation as the single source also
// used by its existing browser bundle. No browser asset rebuild is required.
import { dateInTimeZone, fixtureTimeZone, knownCompetitionTimeZones, fixtureDate } from "lib/formula-a/fatigue-days.js";
export { dateInTimeZone, fixtureTimeZone, knownCompetitionTimeZones, fixtureDate };
export function kickoffContext(fixture,competitionTimeZones={}){
  const datetime=fixture?.status?.utcTime||'';
  const timeZone=fixtureTimeZone(fixture)||competitionTimeZones[Number(fixture?.tournament?.leagueId||0)]||null;
  try{return {datetime,timeZone,date:fixtureDate(fixture,competitionTimeZones),diagnostic:null};}
  catch(error){return {datetime,timeZone,date:null,diagnostic:{code:error.code,message:error.message}};}
}
