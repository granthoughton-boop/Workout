// Muscle groups and the fractional credit each exercise contributes to them.
// One set of Incline DB Press counts as 1.0 chest sets and 0.5 triceps sets.
// Every fraction is editable in Settings.
//
// Kept deliberately coarse: a group earns its place only if you would actually
// program work for it. Muscles that only ever come along for the ride (forearms
// under every curl, front delts under every press) inflated the list without
// ever changing a training decision, so they are not tracked.
//
// Targets are budgeted against a real week rather than picked per muscle in
// isolation: three sessions of ~18 sets, at roughly 1.5 credits per real set,
// is about 80-85 credits to spend. Ordered by priority, so the top of the
// screen is the work that matters most.
export const MUSCLES = [
  { id: 'chest',      name: 'Chest',      target: 12 },
  { id: 'biceps',     name: 'Biceps',     target: 12 },
  { id: 'triceps',    name: 'Triceps',    target: 12 },
  { id: 'side_delts', name: 'Side Delts', target: 10 },
  { id: 'back',       name: 'Back',       target: 9 },
  { id: 'rear_delts', name: 'Rear Delts', target: 6 },
  { id: 'traps',      name: 'Traps',      target: 4 },
  { id: 'quads',      name: 'Quads',      target: 8 },
  { id: 'hamstrings', name: 'Hamstrings', target: 6 },
  { id: 'glutes',     name: 'Glutes',     target: 6 },
  { id: 'core',       name: 'Core',       target: 4 },
];

export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));

// Every exercise in the Hevy export.
export const EXERCISES = [
  { name: 'Incline Bench Press (Dumbbell)',        muscles: { chest: 1, triceps: 0.5 } },
  { name: 'Chest Fly (Machine)',                   muscles: { chest: 1 } },
  { name: 'Leg Press (Machine)',                   muscles: { quads: 1, glutes: 0.5, hamstrings: 0.25 } },
  { name: 'Lat Pulldown (Cable)',                  muscles: { back: 1, biceps: 0.5 } },
  { name: 'Seated Incline Curl (Dumbbell)',        muscles: { biceps: 1 } },
  { name: 'Lateral Raise (Cable)',                 muscles: { side_delts: 1 } },
  { name: 'Leg Extension (Machine)',               muscles: { quads: 1 } },
  { name: 'Overhead Triceps Extension (Cable)',    muscles: { triceps: 1 } },
  { name: 'Bicep Curl (Cable)',                    muscles: { biceps: 1 } },
  { name: 'Lying Leg Curl (Machine)',              muscles: { hamstrings: 1 } },
  { name: 'Iso-Lateral Row (Machine)',             muscles: { back: 1, biceps: 0.5, rear_delts: 0.25 } },
  // Mostly glute medius, so it does not earn a full glute set.
  { name: 'Hip Abduction (Machine)',               muscles: { glutes: 0.5 } },
  { name: 'Face Pull',                             muscles: { rear_delts: 1, back: 0.5 } },
  { name: 'Triceps Pushdown',                      muscles: { triceps: 1 } },
  { name: 'Dead Bug',                              muscles: { core: 1 } },
  { name: 'Seated Dip Machine',                    muscles: { triceps: 1, chest: 0.5 } },
  { name: 'Iso-Lateral Chest Press (Machine)',     muscles: { chest: 1, triceps: 0.5 } },
  { name: 'Triceps Pressdown',                     muscles: { triceps: 1 } },
  { name: 'Rear Delt Reverse Fly (Machine)',       muscles: { rear_delts: 1, back: 0.25 } },
  // Traps, not back: shrugs add nothing to lat width, and crediting them to
  // Back would make the back target look satisfied by work that does not
  // build it.
  { name: 'Shrug (Cable)',                         muscles: { traps: 1 } },
  { name: 'Seated Leg Curl (Machine)',             muscles: { hamstrings: 1 } },
  { name: 'Bicep Curl (Barbell)',                  muscles: { biceps: 1 } },
  { name: 'Chest Supported Incline Row (Dumbbell)',muscles: { back: 1, biceps: 0.5, rear_delts: 0.5 } },
  { name: 'Back Extension (Weighted Hyperextension)', muscles: { core: 1, glutes: 0.5, hamstrings: 0.5 } },
  { name: 'Lunge (Dumbbell)',                      muscles: { quads: 1, glutes: 1, hamstrings: 0.25 } },
  { name: 'Shoulder Press (Dumbbell)',             muscles: { side_delts: 0.5, triceps: 0.5, chest: 0.25 } },
  { name: 'Preacher Curl (Barbell)',               muscles: { biceps: 1 } },
  { name: 'Lat Pulldown (Machine)',                muscles: { back: 1, biceps: 0.5 } },
  { name: 'Deadlift (Trap bar)',                   muscles: { back: 1, glutes: 1, hamstrings: 0.75, quads: 0.5, traps: 0.5, core: 0.5 } },
  { name: 'Pull Up',                               muscles: { back: 1, biceps: 0.5 } },
  { name: 'Cable Core Pallof Press',               muscles: { core: 1 } },
];
