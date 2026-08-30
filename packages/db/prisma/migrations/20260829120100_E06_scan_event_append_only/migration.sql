-- Append-only trigger for ScanEvent: prevent UPDATE and DELETE
CREATE FUNCTION "scan_event_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ScanEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "scan_event_no_update"
  BEFORE UPDATE OR DELETE ON "ScanEvent"
  FOR EACH ROW
  EXECUTE FUNCTION "scan_event_immutable"();
