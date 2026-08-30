// Muscle groups and the fractional credit each exercise contributes to them.
// A "set" of Incline DB Press counts as 1.0 chest sets, 0.5 front delt sets and
// 0.5 triceps sets. Users can override any of this in Settings.

export const MUSCLES = [
  { id: 'chest',      name: 'Chest',      target: 12 },
  { id: 'lats',       name: 'Lats',       target: 12 },
  { id: 'upper_back', name: 'Upper Back', target: 12 },
  { id: 'traps',      name: 'Traps',      target: 6 },
  { id: 'front_delts',name: 'Front Delts',target: 6 },
  { id: 'side_delts', name: 'Side Delts', target: 10 },
  { id: 'rear_delts', name: 'Rear Delts', target: 8 },
  { id: 'biceps',     name: 'Biceps',     target: 10 },
  { id: 'triceps',    name: 'Triceps',    target: 10 },
  { id: 'forearms',   name: 'Forearms',   target: 4 },
  { id: 'quads',      name: 'Quads',      target: 12 },
  { id: 'hamstrings', name: 'Hamstrings', target: 10 },
  { id: 'glutes',     name: 'Glutes',     target: 10 },
  { id: 'calves',     name: 'Calves',     target: 8 },
  { id: 'abs',        name: 'Abs',        target: 8 },
  { id: 'lower_back', name: 'Lower Back', target: 4 },
];

export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));

// Every exercise found in the Hevy export, plus a few common lifts to fill gaps.
export const EXERCISES = [
  { name: 'Incline Bench Press (Dumbbell)',        muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { name: 'Chest Fly (Machine)',                   muscles: { chest: 1, front_delts: 0.25 } },
  { name: 'Leg Press (Machine)',                   muscles: { quads: 1, glutes: 0.5, hamstrings: 0.25 } },
  { name: 'Lat Pulldown (Cable)',                  muscles: { lats: 1, biceps: 0.5, upper_back: 0.25 } },
  { name: 'Seated Incline Curl (Dumbbell)',        muscles: { biceps: 1, forearms: 0.25 } },
  { name: 'Lateral Raise (Cable)',                 muscles: { side_delts: 1, traps: 0.25 } },
  { name: 'Leg Extension (Machine)',               muscles: { quads: 1 } },
  { name: 'Overhead Triceps Extension (Cable)',    muscles: { triceps: 1 } },
  { name: 'Bicep Curl (Cable)',                    muscles: { biceps: 1, forearms: 0.25 } },
  { name: 'Lying Leg Curl (Machine)',              muscles: { hamstrings: 1, calves: 0.25 } },
  { name: 'Iso-Lateral Row (Machine)',             muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.25 } },
  { name: 'Hip Abduction (Machine)',               muscles: { glutes: 1 } },
  { name: 'Face Pull',                             muscles: { rear_delts: 1, upper_back: 0.5, traps: 0.25 } },
  { name: 'Triceps Pushdown',                      muscles: { triceps: 1 } },
  { name: 'Dead Bug',                              muscles: { abs: 1 } },
  { name: 'Seated Dip Machine',                    muscles: { triceps: 1, chest: 0.5, front_delts: 0.25 } },
  { name: 'Iso-Lateral Chest Press (Machine)',     muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { name: 'Triceps Pressdown',                     muscles: { triceps: 1 } },
  { name: 'Rear Delt Reverse Fly (Machine)',       muscles: { rear_delts: 1, upper_back: 0.5 } },
  { name: 'Shrug (Cable)',                         muscles: { traps: 1, forearms: 0.25 } },
  { name: 'Seated Leg Curl (Machine)',             muscles: { hamstrings: 1, calves: 0.25 } },
  { name: 'Bicep Curl (Barbell)',                  muscles: { biceps: 1, forearms: 0.25 } },
  { name: 'Chest Supported Incline Row (Dumbbell)',muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 } },
  { name: 'Back Extension (Weighted Hyperextension)', muscles: { lower_back: 1, glutes: 0.5, hamstrings: 0.5 } },
  { name: 'Lunge (Dumbbell)',                      muscles: { quads: 1, glutes: 1, hamstrings: 0.25 } },
  { name: 'Shoulder Press (Dumbbell)',             muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 } },
  { name: 'Preacher Curl (Barbell)',               muscles: { biceps: 1, forearms: 0.25 } },
  { name: 'Lat Pulldown (Machine)',                muscles: { lats: 1, biceps: 0.5, upper_back: 0.25 } },
  { name: 'Deadlift (Trap bar)',                   muscles: { lower_back: 1, glutes: 1, hamstrings: 0.75, quads: 0.5, traps: 0.5, forearms: 0.5 } },
  { name: 'Calf Press (Machine)',                  muscles: { calves: 1 } },
  { name: 'Pull Up',                               muscles: { lats: 1, biceps: 0.5, upper_back: 0.5 } },
  { name: 'Cable Core Pallof Press',               muscles: { abs: 1 } },
];
