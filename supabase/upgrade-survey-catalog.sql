-- 先完成四段量表升級。新增 VPIRS-E 與學習滿意度，支援待計分及混合題型。
-- 不修改既有發布快照或作答；不建立任何問卷發布；可重跑。
begin;
do $$ begin
 if not exists(select 1 from nptc_private.schema_migrations where version=2026102904) then raise exception '請先完成 upgrade-survey-deletion.sql。'; end if;
end;$$;

create or replace function nptc_private.survey_validate_answers(definition jsonb,answers jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare i integer; q jsonb; answer jsonb; item_type text; mn integer:=coalesce(definition->>'minScore','1')::integer; mx integer:=coalesce(definition->>'maxScore','6')::integer;
begin
 if jsonb_typeof(answers) is distinct from 'array' then raise exception '請提供完整作答。'; end if;
 if jsonb_array_length(answers)<>jsonb_array_length(definition->'items') then raise exception '請完成每一題必填作答。'; end if;
 for i in 0..jsonb_array_length(answers)-1 loop
  q=definition->'items'->i; answer=answers->i; item_type=coalesce(q->>'type','scale');
  if q->'required'='false'::jsonb and (answer='null'::jsonb or answer='""'::jsonb) then continue; end if;
  if item_type='text' then
   if jsonb_typeof(answer)<>'string' or length(trim(answer#>>'{}'))=0 or length(answer#>>'{}')>least(coalesce((q->>'maxLength')::integer,2000),4000) then raise exception '第 % 題文字內容或長度不正確。',i+1; end if;
  elsif item_type='choice' then
   if jsonb_typeof(answer)<>'string' or not coalesce(q->'options','[]'::jsonb) @> jsonb_build_array(answer#>>'{}') then raise exception '請選擇第 % 題的其中一個選項。',i+1; end if;
  elsif item_type='scale' then
   if jsonb_typeof(answer)<>'number' or answer::text !~ '^(0|[1-9][0-9]*)$' then raise exception '每題必須選擇量尺中的整數。'; end if;
   if (answer::text)::integer<mn or (answer::text)::integer>mx then raise exception '作答超出量尺範圍。'; end if;
  else raise exception '不支援的問卷題型。'; end if;
 end loop;
end;$$;

create or replace function nptc_private.survey_score(definition jsonb,answers jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare points jsonb:='[]'::jsonb; dims jsonb:='{}'::jsonb; result jsonb; mn integer:=coalesce(definition->>'minScore','1')::integer; mx integer:=coalesce(definition->>'maxScore','6')::integer;
 n integer; i integer; point_value integer; total integer:=0; dimension text; indices jsonb; subtotal integer;
begin
 perform nptc_private.survey_validate_answers(definition,answers);
 if definition->>'scoringStatus' in ('pending','unscored') then
  return jsonb_build_object('status',definition->>'scoringStatus','itemScores','[]'::jsonb,'total',null,'dimensions','{}'::jsonb);
 end if;
 if jsonb_typeof(answers) is distinct from 'array' then raise exception '請提供完整作答。'; end if;
 n=jsonb_array_length(definition->'items');
 if jsonb_array_length(answers)<>n then raise exception '請完成每一題。'; end if;
 if exists(select 1 from jsonb_array_elements(answers) a where jsonb_typeof(a)<>'number' or a::text !~ '^(0|[1-9][0-9]*)$') then raise exception '每題必須選擇量尺中的整數。'; end if;
 for i in 0..n-1 loop
  point_value=(answers->>i)::integer;
  if point_value<mn or point_value>mx then raise exception '作答超出量尺範圍。'; end if;
  if coalesce(definition->'reverseItems','[]'::jsonb) @> to_jsonb(i+1) then point_value=mn+mx-point_value; end if;
  points=points||jsonb_build_array(point_value); total=total+point_value;
 end loop;
 for dimension,indices in select key,value from jsonb_each(coalesce(definition->'dimensions','{}'::jsonb)) loop
  select coalesce(sum((points->>((j::text)::integer-1))::integer),0)::integer into subtotal from jsonb_array_elements(indices) j;
  dims=dims||jsonb_build_object(dimension,subtotal);
 end loop;
 result=jsonb_build_object('itemScores',points,'total',total,'dimensions',dims);
 if dims ? 'flexibility' then result=result||jsonb_build_object('flexibility',dims->'flexibility'); end if;
 if dims ? 'structure' then result=result||jsonb_build_object('structure',dims->'structure'); end if;
 return result;
end;$$;

create or replace function public.nptc_survey_form(requested_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e text:=nptc_private.survey_require_student(); a nptc_private.survey_assignments; sid uuid; workshop_name text; submitted timestamptz;
begin
 select * into a from nptc_private.survey_assignments where id=requested_assignment and status<>'draft';
 if not found then raise exception '問卷尚未發布或連結無效。'; end if;
 select id into sid from nptc_private.students where workshop_id=a.workshop_id and email=e;
 if sid is null then raise exception '這份問卷不屬於您的工作坊，請確認使用的是受邀學員帳號。' using errcode='42501'; end if;
 select name into workshop_name from nptc_private.workshops where id=a.workshop_id;
 select submitted_at into submitted from nptc_private.survey_responses where assignment_id=a.id and student_id=sid;
 return jsonb_build_object('workshopName',workshop_name,'assignment',jsonb_build_object('id',a.id,'workshop_id',a.workshop_id,'scale_code',a.scale_code,'scale_version',a.scale_version,'created_at',a.created_at,'status',a.status,'revision',a.revision,'opens_at',a.opens_at,'closes_at',a.closes_at,'definition',a.definition-'reverseItems'-'dimensions'-'negativeItems','availability',nptc_private.survey_availability(a.id,sid),'submitted_at',submitted));
end;$$;
revoke all on function nptc_private.survey_validate_answers(jsonb,jsonb) from public,anon,authenticated;
revoke all on function nptc_private.survey_score(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.nptc_survey_form(uuid) from public,anon;
grant execute on function public.nptc_survey_form(uuid) to authenticated;

do $$ begin
 perform nptc_private.survey_validate_definition('{"code":"vpirs-e","version":"zh-TW-draft-20261029","title":"VPIRS-E 虛擬病人整合評估量表","notice":"繁體中文建議版本，尚未經驗證。第 15 題已依在職專科護理師情境調適。計分規則待確認，目前僅保存原始作答，不計算構面分數或總分。","instructions":["本問卷旨在了解您使用虛擬病人進行臨床學習後的經驗與感受。請依據實際學習情況，選擇最符合您想法的答案。","本問卷共 25 題、4 個構面，採五點量尺：1＝非常不同意、2＝不同意、3＝普通、4＝同意、5＝非常同意。"],"minScore":1,"maxScore":5,"leftLabel":"非常不同意","rightLabel":"非常同意","optionLabels":{"1":"非常不同意","2":"不同意","3":"普通","4":"同意","5":"非常同意"},"scoringStatus":"pending","negativeItems":[19,20,21,22,23,24,25],"reverseItems":[],"dimensions":{"知識獲得與保留":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],"學習管理":[15,16,17,18],"非真實性教學":[19,20,21],"學習的不利因素":[22,23,24,25]},"items":[{"section":"構面一：知識獲得與保留","text":"透過虛擬病人學習，讓我獲得許多新的知識。"},{"text":"虛擬病人提供我進一步深化既有知識的機會。"},{"text":"虛擬病人所使用的不同教學方式（例如圖片、文字），讓我更容易學習。"},{"text":"透過虛擬病人學習，讓我更能理解病人的整體性照護。"},{"text":"對虛擬病人進行身體檢查，有助於我記住所學的知識。"},{"text":"在虛擬病人情境中提出鑑別診斷，有助於我培養臨床推理能力，並在遇到症狀相似的病人時，優先判斷最可能的診斷。"},{"text":"對於出現與虛擬病人案例相似症狀的病人，我更了解應如何進行治療。"},{"text":"我對臨床實務中相關疾病的臨床表現，有了更多認識。"},{"text":"虛擬病人案例是課程中適當的組成部分。"},{"text":"透過虛擬病人學習，我更加了解如何對病人進行整體評估與處理。"},{"text":"虛擬病人課程幫助我提升聚焦式病史詢問的能力。"},{"text":"虛擬病人課程幫助我提升聚焦式身體檢查的能力。"},{"text":"虛擬病人幫助我拓展診斷思考，提出更多可能的鑑別診斷。"},{"text":"我學會了如何在特定的臨床情境中處理病人的問題。"},{"section":"構面二：學習管理","text":"在兼顧臨床工作與其他教育訓練要求的情況下，我仍有足夠的時間自主學習虛擬病人案例。"},{"text":"與虛擬病人相關的不同學習任務，可以同時進行。（例如建立病歷、查閱案例相關文獻、準備案例報告及辨識重要臨床發現。）"},{"text":"能夠自行決定何時完成虛擬病人的學習任務，是一項優點。"},{"text":"虛擬病人是持續醫學教育的實用工具。（持續醫學教育係指必修課程以外的教育活動。）"},{"section":"構面三：非真實性教學","text":"使用虛擬病人進行教學，並非真正與臨床實際情境連結的理論學習。"},{"text":"我懷疑虛擬病人的治療方式，是否與真實病人的治療方式一致。"},{"text":"在許多情況下，虛擬病人案例過於理想化。"},{"section":"構面四：學習的不利因素","text":"這些虛擬病人案例對我目前的知識程度而言，要求過高。"},{"text":"虛擬病人案例占用了我太多時間。"},{"text":"無法與教師討論虛擬病人案例，是一項缺點。"},{"text":"我對以英文呈現的虛擬病人案例理解有限。"}]}'::jsonb);
 if exists(select 1 from nptc_private.survey_instruments where code='vpirs-e' and version='zh-TW-draft-20261029' and definition<>'{"code":"vpirs-e","version":"zh-TW-draft-20261029","title":"VPIRS-E 虛擬病人整合評估量表","notice":"繁體中文建議版本，尚未經驗證。第 15 題已依在職專科護理師情境調適。計分規則待確認，目前僅保存原始作答，不計算構面分數或總分。","instructions":["本問卷旨在了解您使用虛擬病人進行臨床學習後的經驗與感受。請依據實際學習情況，選擇最符合您想法的答案。","本問卷共 25 題、4 個構面，採五點量尺：1＝非常不同意、2＝不同意、3＝普通、4＝同意、5＝非常同意。"],"minScore":1,"maxScore":5,"leftLabel":"非常不同意","rightLabel":"非常同意","optionLabels":{"1":"非常不同意","2":"不同意","3":"普通","4":"同意","5":"非常同意"},"scoringStatus":"pending","negativeItems":[19,20,21,22,23,24,25],"reverseItems":[],"dimensions":{"知識獲得與保留":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],"學習管理":[15,16,17,18],"非真實性教學":[19,20,21],"學習的不利因素":[22,23,24,25]},"items":[{"section":"構面一：知識獲得與保留","text":"透過虛擬病人學習，讓我獲得許多新的知識。"},{"text":"虛擬病人提供我進一步深化既有知識的機會。"},{"text":"虛擬病人所使用的不同教學方式（例如圖片、文字），讓我更容易學習。"},{"text":"透過虛擬病人學習，讓我更能理解病人的整體性照護。"},{"text":"對虛擬病人進行身體檢查，有助於我記住所學的知識。"},{"text":"在虛擬病人情境中提出鑑別診斷，有助於我培養臨床推理能力，並在遇到症狀相似的病人時，優先判斷最可能的診斷。"},{"text":"對於出現與虛擬病人案例相似症狀的病人，我更了解應如何進行治療。"},{"text":"我對臨床實務中相關疾病的臨床表現，有了更多認識。"},{"text":"虛擬病人案例是課程中適當的組成部分。"},{"text":"透過虛擬病人學習，我更加了解如何對病人進行整體評估與處理。"},{"text":"虛擬病人課程幫助我提升聚焦式病史詢問的能力。"},{"text":"虛擬病人課程幫助我提升聚焦式身體檢查的能力。"},{"text":"虛擬病人幫助我拓展診斷思考，提出更多可能的鑑別診斷。"},{"text":"我學會了如何在特定的臨床情境中處理病人的問題。"},{"section":"構面二：學習管理","text":"在兼顧臨床工作與其他教育訓練要求的情況下，我仍有足夠的時間自主學習虛擬病人案例。"},{"text":"與虛擬病人相關的不同學習任務，可以同時進行。（例如建立病歷、查閱案例相關文獻、準備案例報告及辨識重要臨床發現。）"},{"text":"能夠自行決定何時完成虛擬病人的學習任務，是一項優點。"},{"text":"虛擬病人是持續醫學教育的實用工具。（持續醫學教育係指必修課程以外的教育活動。）"},{"section":"構面三：非真實性教學","text":"使用虛擬病人進行教學，並非真正與臨床實際情境連結的理論學習。"},{"text":"我懷疑虛擬病人的治療方式，是否與真實病人的治療方式一致。"},{"text":"在許多情況下，虛擬病人案例過於理想化。"},{"section":"構面四：學習的不利因素","text":"這些虛擬病人案例對我目前的知識程度而言，要求過高。"},{"text":"虛擬病人案例占用了我太多時間。"},{"text":"無法與教師討論虛擬病人案例，是一項缺點。"},{"text":"我對以英文呈現的虛擬病人案例理解有限。"}]}'::jsonb) then
  raise exception '量表版本已存在且內容不同，請勿覆寫既有版本。';
 end if;
end;$$;
insert into nptc_private.survey_instruments(code,version,definition) values('vpirs-e','zh-TW-draft-20261029','{"code":"vpirs-e","version":"zh-TW-draft-20261029","title":"VPIRS-E 虛擬病人整合評估量表","notice":"繁體中文建議版本，尚未經驗證。第 15 題已依在職專科護理師情境調適。計分規則待確認，目前僅保存原始作答，不計算構面分數或總分。","instructions":["本問卷旨在了解您使用虛擬病人進行臨床學習後的經驗與感受。請依據實際學習情況，選擇最符合您想法的答案。","本問卷共 25 題、4 個構面，採五點量尺：1＝非常不同意、2＝不同意、3＝普通、4＝同意、5＝非常同意。"],"minScore":1,"maxScore":5,"leftLabel":"非常不同意","rightLabel":"非常同意","optionLabels":{"1":"非常不同意","2":"不同意","3":"普通","4":"同意","5":"非常同意"},"scoringStatus":"pending","negativeItems":[19,20,21,22,23,24,25],"reverseItems":[],"dimensions":{"知識獲得與保留":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],"學習管理":[15,16,17,18],"非真實性教學":[19,20,21],"學習的不利因素":[22,23,24,25]},"items":[{"section":"構面一：知識獲得與保留","text":"透過虛擬病人學習，讓我獲得許多新的知識。"},{"text":"虛擬病人提供我進一步深化既有知識的機會。"},{"text":"虛擬病人所使用的不同教學方式（例如圖片、文字），讓我更容易學習。"},{"text":"透過虛擬病人學習，讓我更能理解病人的整體性照護。"},{"text":"對虛擬病人進行身體檢查，有助於我記住所學的知識。"},{"text":"在虛擬病人情境中提出鑑別診斷，有助於我培養臨床推理能力，並在遇到症狀相似的病人時，優先判斷最可能的診斷。"},{"text":"對於出現與虛擬病人案例相似症狀的病人，我更了解應如何進行治療。"},{"text":"我對臨床實務中相關疾病的臨床表現，有了更多認識。"},{"text":"虛擬病人案例是課程中適當的組成部分。"},{"text":"透過虛擬病人學習，我更加了解如何對病人進行整體評估與處理。"},{"text":"虛擬病人課程幫助我提升聚焦式病史詢問的能力。"},{"text":"虛擬病人課程幫助我提升聚焦式身體檢查的能力。"},{"text":"虛擬病人幫助我拓展診斷思考，提出更多可能的鑑別診斷。"},{"text":"我學會了如何在特定的臨床情境中處理病人的問題。"},{"section":"構面二：學習管理","text":"在兼顧臨床工作與其他教育訓練要求的情況下，我仍有足夠的時間自主學習虛擬病人案例。"},{"text":"與虛擬病人相關的不同學習任務，可以同時進行。（例如建立病歷、查閱案例相關文獻、準備案例報告及辨識重要臨床發現。）"},{"text":"能夠自行決定何時完成虛擬病人的學習任務，是一項優點。"},{"text":"虛擬病人是持續醫學教育的實用工具。（持續醫學教育係指必修課程以外的教育活動。）"},{"section":"構面三：非真實性教學","text":"使用虛擬病人進行教學，並非真正與臨床實際情境連結的理論學習。"},{"text":"我懷疑虛擬病人的治療方式，是否與真實病人的治療方式一致。"},{"text":"在許多情況下，虛擬病人案例過於理想化。"},{"section":"構面四：學習的不利因素","text":"這些虛擬病人案例對我目前的知識程度而言，要求過高。"},{"text":"虛擬病人案例占用了我太多時間。"},{"text":"無法與教師討論虛擬病人案例，是一項缺點。"},{"text":"我對以英文呈現的虛擬病人案例理解有限。"}]}'::jsonb) on conflict(code,version) do nothing;

do $$ begin
 perform nptc_private.survey_validate_definition('{"code":"nptc-learning-satisfaction","version":"zh-TW-1109-draft-20261029","title":"為國考而訓：學習滿意度與意見回饋","notice":"本問卷用於課程滿意度與意見回饋，保存原始回覆，不提供合成總分。","instructions":["各位學員您好：為瞭解課程之實際成效，希望藉由此份問卷，提供我們寶貴的意見，作為改進課程的參考。","前 11 題採五點滿意度單選：1＝非常不滿意、2＝不滿意、3＝尚可、4＝滿意、5＝非常滿意。","推薦意願請選擇是或否；三題文字意見為選填。"],"minScore":1,"maxScore":5,"leftLabel":"非常不滿意","rightLabel":"非常滿意","optionLabels":{"1":"非常不滿意","2":"不滿意","3":"尚可","4":"滿意","5":"非常滿意"},"scoringStatus":"unscored","reverseItems":[],"dimensions":{},"items":[{"text":"主題: 診斷思維的謬誤與釐清     講師:張智維專科護理師"},{"text":"臨床思維訓練 I 整體滿意度"},{"text":"主題為OSCE 考題解說與知識建構-雙主訴, 講師: 王家鼎  醫師"},{"text":"臨床思維訓練 II 整體滿意度"},{"text":"OSCE 考題解說與知識建構-認知偏誤, 講師: 張智維  醫師"},{"text":"OSCE教案實作考官整體滿意度"},{"text":"OSCE教案實作SP整體滿意度"},{"text":"考官座談會整體滿意度"},{"text":"課程主題內容是否符合期待"},{"text":"課程場地安排"},{"text":"整體滿意度"},{"type":"text","required":false,"maxLength":2000,"text":"您覺得我們的課程最大的特色在哪裡?"},{"type":"choice","options":["是","否"],"text":"往後是否會推薦學弟妹參加課程？"},{"type":"text","required":false,"maxLength":2000,"text":"呈上題 ,您的理由是？"},{"type":"text","required":false,"maxLength":2000,"text":"對於未來課程安排，您建議的主題是"}]}'::jsonb);
 if exists(select 1 from nptc_private.survey_instruments where code='nptc-learning-satisfaction' and version='zh-TW-1109-draft-20261029' and definition<>'{"code":"nptc-learning-satisfaction","version":"zh-TW-1109-draft-20261029","title":"為國考而訓：學習滿意度與意見回饋","notice":"本問卷用於課程滿意度與意見回饋，保存原始回覆，不提供合成總分。","instructions":["各位學員您好：為瞭解課程之實際成效，希望藉由此份問卷，提供我們寶貴的意見，作為改進課程的參考。","前 11 題採五點滿意度單選：1＝非常不滿意、2＝不滿意、3＝尚可、4＝滿意、5＝非常滿意。","推薦意願請選擇是或否；三題文字意見為選填。"],"minScore":1,"maxScore":5,"leftLabel":"非常不滿意","rightLabel":"非常滿意","optionLabels":{"1":"非常不滿意","2":"不滿意","3":"尚可","4":"滿意","5":"非常滿意"},"scoringStatus":"unscored","reverseItems":[],"dimensions":{},"items":[{"text":"主題: 診斷思維的謬誤與釐清     講師:張智維專科護理師"},{"text":"臨床思維訓練 I 整體滿意度"},{"text":"主題為OSCE 考題解說與知識建構-雙主訴, 講師: 王家鼎  醫師"},{"text":"臨床思維訓練 II 整體滿意度"},{"text":"OSCE 考題解說與知識建構-認知偏誤, 講師: 張智維  醫師"},{"text":"OSCE教案實作考官整體滿意度"},{"text":"OSCE教案實作SP整體滿意度"},{"text":"考官座談會整體滿意度"},{"text":"課程主題內容是否符合期待"},{"text":"課程場地安排"},{"text":"整體滿意度"},{"type":"text","required":false,"maxLength":2000,"text":"您覺得我們的課程最大的特色在哪裡?"},{"type":"choice","options":["是","否"],"text":"往後是否會推薦學弟妹參加課程？"},{"type":"text","required":false,"maxLength":2000,"text":"呈上題 ,您的理由是？"},{"type":"text","required":false,"maxLength":2000,"text":"對於未來課程安排，您建議的主題是"}]}'::jsonb) then
  raise exception '量表版本已存在且內容不同，請勿覆寫既有版本。';
 end if;
end;$$;
insert into nptc_private.survey_instruments(code,version,definition) values('nptc-learning-satisfaction','zh-TW-1109-draft-20261029','{"code":"nptc-learning-satisfaction","version":"zh-TW-1109-draft-20261029","title":"為國考而訓：學習滿意度與意見回饋","notice":"本問卷用於課程滿意度與意見回饋，保存原始回覆，不提供合成總分。","instructions":["各位學員您好：為瞭解課程之實際成效，希望藉由此份問卷，提供我們寶貴的意見，作為改進課程的參考。","前 11 題採五點滿意度單選：1＝非常不滿意、2＝不滿意、3＝尚可、4＝滿意、5＝非常滿意。","推薦意願請選擇是或否；三題文字意見為選填。"],"minScore":1,"maxScore":5,"leftLabel":"非常不滿意","rightLabel":"非常滿意","optionLabels":{"1":"非常不滿意","2":"不滿意","3":"尚可","4":"滿意","5":"非常滿意"},"scoringStatus":"unscored","reverseItems":[],"dimensions":{},"items":[{"text":"主題: 診斷思維的謬誤與釐清     講師:張智維專科護理師"},{"text":"臨床思維訓練 I 整體滿意度"},{"text":"主題為OSCE 考題解說與知識建構-雙主訴, 講師: 王家鼎  醫師"},{"text":"臨床思維訓練 II 整體滿意度"},{"text":"OSCE 考題解說與知識建構-認知偏誤, 講師: 張智維  醫師"},{"text":"OSCE教案實作考官整體滿意度"},{"text":"OSCE教案實作SP整體滿意度"},{"text":"考官座談會整體滿意度"},{"text":"課程主題內容是否符合期待"},{"text":"課程場地安排"},{"text":"整體滿意度"},{"type":"text","required":false,"maxLength":2000,"text":"您覺得我們的課程最大的特色在哪裡?"},{"type":"choice","options":["是","否"],"text":"往後是否會推薦學弟妹參加課程？"},{"type":"text","required":false,"maxLength":2000,"text":"呈上題 ,您的理由是？"},{"type":"text","required":false,"maxLength":2000,"text":"對於未來課程安排，您建議的主題是"}]}'::jsonb) on conflict(code,version) do nothing;

insert into nptc_private.schema_migrations(version) values(2026102905) on conflict do nothing;
notify pgrst,'reload schema';
commit;
