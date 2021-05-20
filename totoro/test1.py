from geometry_msgs.msg import Twist
import rospy
rospy.init_node('get_center', anonymous=True)
velocity_publisher = rospy.Publisher('/cmd_vel', Twist, queue_size=1)
vel_msg = Twist()
import roslib
import rospy
from kidbright_tpu.msg import tpu_object
from kidbright_tpu.msg import tpu_objects
import rosnode
import subprocess
import time
import os
ros_nodes = rosnode.get_node_names()
if not '/image_feature' in ros_nodes:
	command='rosrun kidbright_tpu tpu_detect.py /home/pi/kbclientNew/nectec-client/dist/totoro'
	process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE)
	time.sleep(10)
for count in range(20):
  print('hello world')
