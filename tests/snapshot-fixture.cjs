/* Synthetic fixture only. Never commit a real user's snapshot to this repo. */
module.exports = () => ({
  format:"gaming-snapshot",schemaVersion:1,readOnly:true,
  exportedAt:"2026-10-08T00:00:00Z",source:"Synthetic test",engineSha256:"a".repeat(64),
  injaz:{
    rank:{points:10,name:"مبتدئ",stars:0,tier:1},
    totals:{awards:1,points:10,games:1,hours:10,finishes:0,raAwards:0},
    families:[{key:"hours",name:"الساعات",icon:"⏳",points:10,awards:1,share:100}],
    materials:[{tier:1,name:"نحاس",hex:"#C8804F",shape:"disc",pays:10,awards:1}],
    awards:[{key:"a1",name:"ساعة لعب",shortName:"ساعة لعب",family:"hours",familyName:"الساعات",icon:"⏳",tier:1,material:"نحاس",hex:"#C8804F",shape:"disc",points:10,date:"2026-08-01T12:00:00.0000000Z",game:"لعبة اختبار"}]
  },
  stats:{
    totals:{hours:10,datedHours:2,undatedHours:8,outsideHours:0,clockHours:2,clockSittings:1,games:1,played:1,sittings:2,days:1,first:"2026-08-01",last:"2026-08-01",perPlayDay:2,perSitting:5,streak:0,bestStreak:1,bestFrom:"2026-08-01",bestTo:"2026-08-01"},
    years:[{key:"2026",hours:2,sittings:1,games:1}],months:[{key:"2026-08",hours:2,sittings:1,games:1}],weekdays:[],hours24:[],devices:[],families:[],genres:[],decades:[],sources:[],
    top:[{id:"g1",name:"لعبة اختبار",hours:10,sittings:2}]
  },
  games:[{id:"g1",name:"لعبة اختبار",platform:"PC",family:"pc",hours:10,sittings:2,beats:0,days:1,lastPlayed:"2026-08-01",lastPlayedExact:true}],
  days:[{d:"2026-08-01",h:2,n:1}]
});
