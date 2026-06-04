"""
Seed script to populate the launch spots database with initial data
Run with: python seed.py
"""
from app import app, db, LaunchSpot


def seed_launch_spots():
    """Add initial launch spot data to the database"""
    
    # Check if data already exists
    if LaunchSpot.query.first() is not None:
        print("Database already contains launch spots. Skipping seed.")
        return
    
    launch_spots = [
        LaunchSpot(
            name="Weston Shore",
            lat=50.8992,
            lon=-1.3850,
            description="Popular launch spot with parking",
            facilities=["parking", "toilets"],
            tide_station="Southampton"
        ),
        LaunchSpot(
            name="Calshot Beach",
            lat=50.8108,
            lon=-1.3055,
            description="Beach launch, accessible at most tide states",
            facilities=["parking", "cafe"],
            tide_station="Southampton"
        ),
        LaunchSpot(
            name="Hamble Point",
            lat=50.8545,
            lon=-1.3093,
            description="River launch, sheltered",
            facilities=["parking"],
            tide_station="Southampton"
        )
    ]
    
    with app.app_context():
        for spot in launch_spots:
            db.session.add(spot)
        
        db.session.commit()
        print(f"Successfully added {len(launch_spots)} launch spots to the database")


if __name__ == '__main__':
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        seed_launch_spots()
