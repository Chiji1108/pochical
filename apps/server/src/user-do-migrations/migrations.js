import journal from './meta/_journal.json';
import m0000 from './0000_memberships.sql';
import m0001 from './0001_day_fields.sql';
import m0002 from './0002_patterns.sql';
import m0003 from './0003_pushed_cursor.sql';
import m0004 from './0004_orders-coworkers.sql';
import m0005 from './0005_order_clears.sql';
import m0006 from './0006_group_requests.sql';
import m0007 from './0007_membership_values.sql';
import m0008 from './0008_membership_left.sql';
import m0009 from './0009_unread_counts.sql';
import m0010 from './0010_blocks.sql';
import m0011 from './0011_push_tokens.sql';
import m0012 from './0012_chat_mutes.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012
    }
  }
  