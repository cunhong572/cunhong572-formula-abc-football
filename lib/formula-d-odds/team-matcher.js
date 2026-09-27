// Inputs use the scanner normalization; gender and age markers remain intact.
export function createTeamMatcher(){
    const teamMatch=(source,target)=>{
      if(!source||!target)return false;
      const variants=s=>{
        const out=new Set([s]);
        // Gender and age-group markers are part of team identity. Only
        // ordinary club affixes may be removed, never Women/W/U21/etc.
        const suffixes=["afc","fc","cf","sc","club"];
        for(const x of suffixes)if(s.length>x.length+3&&s.endsWith(x))out.add(s.slice(0,-x.length));
        for(const x of ["afc","fc","cf","sc"])if(s.length>x.length+3&&s.startsWith(x))out.add(s.slice(x.length));
        return [...out];
      };
      const sv=variants(source),tv=variants(target);
      return sv.some(x=>tv.includes(x));
    };
    return {teamMatch};
}
