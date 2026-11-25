-- Keep review images in the managed business schema, including on fresh databases.
-- IF NOT EXISTS also supports installations where this table was created manually.
CREATE TABLE IF NOT EXISTS store.review_images (
    review_id bigint NOT NULL REFERENCES store.reviews(review_id) ON DELETE CASCADE,
    image_url varchar(500) NOT NULL,
    image_position integer NOT NULL,
    cloudinary_public_id varchar(255),
    PRIMARY KEY (review_id, image_position)
);
