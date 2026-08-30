-- Cross-epic field requested by E05 (writes at delivery time) and E07 (reads
-- for the pre_reveal anomaly rule). Added by E07 since E05 hadn't started —
-- see issues #5/#6 and docs/epics/CROSS-EPIC-REQUESTS.md.
ALTER TABLE "Batch" ADD COLUMN "expectedShipDate" TIMESTAMP(3);
