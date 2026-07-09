/**
 * Dummy projects + PMS classes for the Revision module POC.
 * Replace with real fetches from the project / PMS services later.
 */

export interface DummyProject {
  id: string;
  name: string;
  client: string;
}

export interface DummyPmsClass {
  id: string;
  name: string;
  description: string;
  rating: string;
  material: string;
}

export const DUMMY_PROJECTS: DummyProject[] = [
  { id: "PROJ-001", name: "Mumbai Refinery Expansion", client: "BPCL" },
  { id: "PROJ-002", name: "Jamnagar Phase 3", client: "Reliance" },
  { id: "PROJ-003", name: "Paradip LNG Terminal", client: "IOCL" },
  { id: "PROJ-004", name: "Vadodara Petrochem", client: "ONGC" },
  { id: "PROJ-005", name: "Kakinada Gas Processing", client: "GAIL" },
];

export const DUMMY_PMS_CLASSES: DummyPmsClass[] = [
  { id: "PMS-A1A", name: "A1A", description: "Carbon steel, ASME 150#", rating: "150#", material: "Carbon Steel" },
  { id: "PMS-A1B", name: "A1B", description: "Carbon steel, ASME 300#", rating: "300#", material: "Carbon Steel" },
  { id: "PMS-B1A", name: "B1A", description: "Stainless 316, ASME 150#", rating: "150#", material: "SS 316" },
  { id: "PMS-B1B", name: "B1B", description: "Stainless 316, ASME 300#", rating: "300#", material: "SS 316" },
  { id: "PMS-C1A", name: "C1A", description: "Duplex SS, ASME 150#", rating: "150#", material: "Duplex" },
  { id: "PMS-D1A", name: "D1A", description: "Hastelloy C276, ASME 300#", rating: "300#", material: "Hastelloy" },
];
