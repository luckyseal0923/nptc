import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeThreshold,validateGrade,gradeStatus,formatScore} from '../lib/grading.ts';
test('borderline includes only rating 3 and preserves zero',()=>{assert.deepEqual(computeThreshold([{score:0,rating:3},{score:70,rating:3},{score:100,rating:5},{score:null,rating:null}]),{value:35,count:2});});
test('missing borderline group is unavailable, not zero',()=>assert.deepEqual(computeThreshold([{score:90,rating:4}]),{value:null,count:0}));
test('fixed passing line and presentation rounding are separate',()=>{assert.equal(gradeStatus(60),'及格');assert.equal(gradeStatus(59.999),'未達及格');assert.equal(gradeStatus(null),'尚未登錄');assert.equal(formatScore(200/3),'66.67');});
test('scores and ratings validate as a pair',()=>{assert.deepEqual(validateGrade(0,1),{score:0,rating:1});assert.deepEqual(validateGrade(100,5),{score:100,rating:5});assert.deepEqual(validateGrade(null,null),{score:null,rating:null});for(const [s,r] of [[101,3],[-1,3],[50,0],[50,6],[50,3.5],[null,3],[50,null],['50',3],[NaN,3]])assert.throws(()=>validateGrade(s,r));});
