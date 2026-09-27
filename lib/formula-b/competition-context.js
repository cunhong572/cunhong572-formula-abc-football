export function isUCL(name){return /champions league/i.test(name||"")&&!/women/i.test(name||"")}

export function isUEL(name){return /europa league/i.test(name||"")&&!/conference/i.test(name||"")}

export function isUECL(name){return /conference league/i.test(name||"")}

export function isNationsLeague(name){return /(?:UEFA\s*)?Nations\s+League/i.test(name||"")&&!/(women|u\s?[-]?\s?(?:17|19|21)|youth)/i.test(name||"")}
