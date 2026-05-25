import type { InstantRules } from "@instantdb/react-native";

const rules = {
  $default: {
    allow: {
      $default: "false",
    },
  },
  attrs: {
    allow: {
      create: "false",
    },
  },
  $users: {
    allow: {
      view: "auth.id != null",
    },
    fields: {
      email: "auth.id != null && auth.id == data.id",
    },
  },
  shiftPatterns: {
    allow: {
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
      view: "auth.id != null",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
  shifts: {
    allow: {
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
      view: "auth.id != null",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
  shiftMembers: {
    allow: {
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
      view: "auth.id != null",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
} satisfies InstantRules;

export default rules;
