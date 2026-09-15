export const analysisFixture = [
 {workshops:[{id:'w1',name:'基礎練習班',created_at:'2026-01-01'},{id:'w2',name:'整合演練班',created_at:'2026-02-01'}],selected:{id:'w1',name:'基礎練習班',created_at:'2026-01-01',stations:[{key:'q1',title:'病史詢問',testDate:'2026-01-10'},{key:'q2',title:'溝通與衛教',testDate:'2026-01-11'}]},thresholds:[{key:'q1',value:60,count:1},{key:'q2',value:null,count:0}],students:[
 {id:'s1',workshop_id:'w1',name:'測試學員甲',email:'sample-a@example.test',hospital:'教學醫院甲',unit:'內科病房',nursing_years:0,exam_specialty:'內科',first_osce:false,q1_score:60,q1_rating:3,q1_feedback:'病史整理清楚，可補充病人對疾病的理解。',q2_score:0,q2_rating:1},
 {id:'s2',workshop_id:'w1',name:'測試學員乙',email:'sample-b@example.test',hospital:'教學醫院乙',unit:'外科病房',nursing_years:12,exam_specialty:'外科',first_osce:true,q1_score:90,q1_rating:5,q2_score:null,q2_rating:null},
 {id:'s3',workshop_id:'w1',name:'測試學員丙',email:'sample-c@example.test',hospital:null,unit:null,nursing_years:null,exam_specialty:null,first_osce:null}
 ]},
 {workshops:[{id:'w1',name:'基礎練習班',created_at:'2026-01-01'},{id:'w2',name:'整合演練班',created_at:'2026-02-01'}],selected:{id:'w2',name:'整合演練班',created_at:'2026-02-01',stations:[{key:'q1',title:'臨床情境整合',testDate:'2026-02-10'}]},thresholds:[{key:'q1',value:80,count:1}],students:[
 {id:'s4',workshop_id:'w2',name:'測試學員甲',email:' SAMPLE-A@EXAMPLE.TEST ',hospital:'教學醫院甲',unit:'內科病房',nursing_years:0,exam_specialty:'內科',first_osce:false,q1_score:75,q1_rating:2,q1_feedback:'持續練習整合評估與表達。'},
 {id:'s5',workshop_id:'w2',name:'測試學員乙',email:'another-b@example.test',hospital:'教學醫院乙',unit:'外科病房',nursing_years:7,exam_specialty:'外科',first_osce:true,q1_score:100,q1_rating:5}
 ]}
];
