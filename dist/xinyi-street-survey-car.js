// 信義街景・勤務車（訓練示意）：臺北市消防局三菱 Outlander（依實車照片製作的 survey-car.glb）。
// 派遣火警後隨分隊自信義分隊車庫前出口出勤，沿駕駛路網到火場附近順向停車，作為現場指揮據點。
// 與水庫車共用同一套出勤、行駛、停車與避讓邏輯（createTanker 的 spec 參數），不載水、不補水。
// 出勤時間、車速、停車點皆為示意，不是實際派遣規定或車輛性能。
import {createTanker} from './xinyi-street-tanker.js?v=survey-20261025';

export const SURVEY_CAR={name:'信義勤務車',label:'信義勤務車',capacity:0,turnout:20,speed:12,refill:0,range:0,
 tyreRadius:.352,stagingMin:20,stagingMax:70,spacing:10,pitchHalf:1.335,color:'#ffd27a',tagY:2.7,
 dispatchText:'派遣出勤（指揮勤務車）',arriveText:'抵達現場，設立指揮據點',
 // 車長約 4.7 m：兩個碰撞圓
 circles:[-1.2,1.2],radius:1.0};

export const createSurveyCar=opts=>createTanker({...opts,spec:SURVEY_CAR});
