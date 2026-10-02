import journal from './meta/_journal.json';
import m0000 from './0000_profile.sql';
import m0001 from './0001_members.sql';
import m0002 from './0002_member_shifts.sql';
import m0003 from './0003_member_repeat_orders.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003
    }
  }
  