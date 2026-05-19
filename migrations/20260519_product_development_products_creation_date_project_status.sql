ALTER TABLE product_development_products
  RENAME COLUMN deadline TO creation_date;

ALTER TABLE product_development_products
  ADD COLUMN IF NOT EXISTS project_status VARCHAR(255) DEFAULT 'in progress';

UPDATE product_development_products
SET creation_date = COALESCE(creation_date, CAST(created_at AS DATE), CURRENT_DATE)
WHERE creation_date IS NULL;

UPDATE product_development_products
SET project_status = LOWER(BTRIM(COALESCE(project_status, 'in progress')));

UPDATE product_development_products
SET project_status = 'in progress'
WHERE project_status NOT IN ('in progress', 'stand by', 'done', 'blocked');

ALTER TABLE product_development_products
  ALTER COLUMN creation_date SET NOT NULL;

ALTER TABLE product_development_products
  ALTER COLUMN project_status SET NOT NULL;

ALTER TABLE product_development_products
  ALTER COLUMN project_status SET DEFAULT 'in progress';
