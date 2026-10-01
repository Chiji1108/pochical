import journal from './meta/_journal.json';
import m0000 from './0000_memberships.sql';
import m0001 from './0001_day_fields.sql';
import m0002 from './0002_patterns.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002
    }
  }
  