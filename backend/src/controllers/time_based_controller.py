class TimeBasedController:
    @staticmethod
    def get_green_time():
        # Fixed 8 seconds green signal + 2s wait = 10s total for each lane
        return 8.0

    @staticmethod
    def get_wait_time():
        # Fixed 2 seconds waiting time for each lane (AMBER)
        return 2.0
