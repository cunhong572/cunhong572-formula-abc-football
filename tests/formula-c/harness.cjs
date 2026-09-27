const {load}=require('../formula-d/harness.cjs');
const fixture=require('./fixtures/live.json');
const plain=x=>JSON.parse(JSON.stringify(x));
const blocked=()=>{throw Error('Formula C tests forbid network, database and live services');};
const e=load('lib/formula-d-engine.js',['evaluateLiveIntent','computeFormulaDMetrics','computeGTI','FORMULA_D_INTENTS','classify']).subject;
function provider(bindings={}){
 return load('api/formula-d-live.js',['shotData','eventCounts','sideMetrics','getPreMatchContext'],{
  requireAuth:blocked,trackedFetch:blocked,saveFormulaDSnapshot:blocked,
  refreshTeamRoster:blocked,getPlayerKnowledge:blocked,enrichPlayer:blocked,
  getDirectPlayerKnowledge:blocked,substitutionImpact:blocked,getFormulaDWeights:blocked,...bindings
 }).subject;
}
function detail(shots=fixture.shots,events=fixture.events){return {content:{shotmap:{shots:plain(shots)}},header:{events:plain(events)}};}
function evaluate(live={},forGoals=0,againstGoals=0,minute=60){return e.evaluateLiveIntent(forGoals,againstGoals,minute,2,3,plain(live));}
function evidence(changes={}){return {...plain(fixture.strong),...changes};}
module.exports={load,fixture,plain,blocked,e,provider,detail,evaluate,evidence};

// The manual API puts two exports on one line. Adapt module syntax only;
// use the real production engine and keep all external effects unavailable.
function manualHandler(){
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../../api/formula-d.js'),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export default async function(','async function handler(').replace(/\bexport (?=const )/g,'');
 const clock=load('lib/formula-c-live-evidence.js',['matchMinute']).subject;
 const context=vm.createContext({...e,...clock,requireAuth:async()=>({}),getFormulaDWeights:async()=>({config:{}}),fetch:blocked,db:{query:blocked},setTimeout:blocked});
 vm.runInContext(source+'\n;globalThis.subject=handler;',context,{timeout:2000});return context.subject;
}
module.exports.manualHandler=manualHandler;
